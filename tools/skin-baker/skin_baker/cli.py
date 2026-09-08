"""Build pipeline for the game catalogue.

The productionised form of prefetch-demo/build_skins.py. Four stages, each
idempotent and keyed by content hash, so re-running is cheap and rebuilding one
game does not invalidate the shared engine for the other 29:

    classify  derive the prefetch tiers from a recorded cold load
    bake      palette-rotate the per-game art, rename it, hash it
    publish   upload to object storage and register the manifest with the API
    all       classify -> bake -> publish

    skin-baker classify --trace prefetch-demo/report.jsonl
    skin-baker bake --only king-rhino
    skin-baker publish --backend local --local-root ./cdn --no-dry-run
"""

import json
import logging
import os
import sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from pathlib import Path
from typing import Annotated, Any, cast

import structlog
import typer

from skin_baker.bake import Asset, BakedGame, bake_game, engine_version
from skin_baker.catalogue import load_catalogue
from skin_baker.classify import Tier, load_traces
from skin_baker.classify import classify as classify_traces
from skin_baker.publish import (
    LocalStorage,
    Storage,
    SupabaseStorage,
    register,
    upload_catalogue,
)

app = typer.Typer(add_completion=False, help="Bake and publish game bundles.", no_args_is_help=True)
log = structlog.get_logger("skin-baker")

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_SOURCE = REPO_ROOT
DEFAULT_CATALOGUE = REPO_ROOT / "prefetch-demo" / "site" / "games.json"
DEFAULT_OUT = Path("out")
TIERS_FILE = "tiers.json"
MANIFEST_FILE = "manifest.json"


@app.callback()
def _setup(verbose: bool = typer.Option(False, "--verbose", "-v")) -> None:
    logging.basicConfig(
        format="%(message)s", stream=sys.stderr, level=logging.DEBUG if verbose else logging.INFO
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.dev.ConsoleRenderer(),
        ],
        logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
    )


VALID_TIERS: frozenset[str] = frozenset(("slice", "animation", "audio", "rest"))


def _load_tiers(out: Path) -> dict[str, Tier]:
    path = out / TIERS_FILE
    if not path.is_file():
        raise typer.BadParameter(
            f"{path} not found — run `skin-baker classify --trace <file>` first."
        )
    raw = json.loads(path.read_text())
    if not isinstance(raw, dict):
        raise typer.BadParameter(f"{path} is not a tier map")

    # Validated rather than cast: an unknown tier here would silently become a
    # tier the API rejects, halfway through publishing a catalogue.
    tiers: dict[str, Tier] = {}
    for key, value in raw.items():
        if value not in VALID_TIERS:
            raise typer.BadParameter(f"{path}: unknown tier {value!r} for {key!r}")
        tiers[str(key)] = cast(Tier, value)
    return tiers


@app.command()
def classify(
    trace: Annotated[Path, typer.Option(help="Recorded load: report JSONL or a .har")],
    out: Annotated[Path, typer.Option(help="Output directory")] = DEFAULT_OUT,
    quorum: Annotated[
        float, typer.Option(min=0.0, max=1.0, help="Fraction of runs a file must appear in")
    ] = 0.5,
) -> None:
    """Derive the prefetch tiers from a real load. Writes out/tiers.json."""
    traces = load_traces(trace)
    tiers = classify_traces(traces, quorum=quorum)

    out.mkdir(parents=True, exist_ok=True)
    (out / TIERS_FILE).write_text(json.dumps(tiers, indent=1, sort_keys=True))

    counts: dict[str, int] = {}
    for tier in tiers.values():
        counts[tier] = counts.get(tier, 0) + 1
    log.info("classified", runs=len(traces), files=len(tiers), **counts)
    typer.echo(f"→ {out / TIERS_FILE}")


def _bake_one(args: tuple[object, ...]) -> tuple[BakedGame, bool]:
    game, source, out, tiers, engine, force = args
    return bake_game(
        game,  # type: ignore[arg-type]
        source=source,  # type: ignore[arg-type]
        out=out,  # type: ignore[arg-type]
        tiers=tiers,  # type: ignore[arg-type]
        engine=engine,  # type: ignore[arg-type]
        force=force,  # type: ignore[arg-type]
    )


@app.command()
def bake(
    source: Annotated[Path, typer.Option(envvar="SOURCE_BUNDLE_DIR")] = DEFAULT_SOURCE,
    catalogue: Annotated[Path, typer.Option(help="games.json")] = DEFAULT_CATALOGUE,
    out: Annotated[Path, typer.Option()] = DEFAULT_OUT,
    only: Annotated[list[str] | None, typer.Option(help="Bake a single slug")] = None,
    force: Annotated[bool, typer.Option(help="Ignore the up-to-date stamp")] = False,
    jobs: Annotated[int, typer.Option("-j", min=1, help="Worker processes")] = min(
        8, os.cpu_count() or 4
    ),
) -> None:
    """Recolour the per-game art and write out/manifest.json."""
    tiers = _load_tiers(out)
    games = load_catalogue(catalogue, only)
    engine = engine_version(source, tiers)
    out.mkdir(parents=True, exist_ok=True)

    # A classified path with no file behind it means the game requests something
    # the bundle does not ship — a 404 on every single load. Cheap to miss, so
    # say it out loud rather than quietly dropping it from the manifest.
    absent = sorted(p for p in tiers if not (source / p).is_file())
    for path in absent:
        log.warning("requested_but_missing_from_bundle", path=path, tier=tiers[path])

    log.info("baking", games=len(games), engine_version=engine, workers=jobs, missing=len(absent))

    work = [(g, source, out, tiers, engine, force) for g in games]
    baked: list[BakedGame] = []
    rebuilt = 0
    with ProcessPoolExecutor(max_workers=jobs) as pool:
        for index, (manifest, was_built) in enumerate(pool.map(_bake_one, work), start=1):
            baked.append(manifest)
            rebuilt += was_built
            skinned = sum(a.bytes for a in manifest.assets if a.is_skinned)
            typer.echo(
                f"  [{index:2}/{len(games)}] {manifest.slug:24} "
                f"{skinned / 1048576:5.1f} MB skinned  "
                f"{'built' if was_built else 'up to date'}"
            )

    # A rebuilt game keeps its slug but gets a new bundle_version; merge into any
    # existing manifest so `--only` does not drop the other 29 games.
    manifest_path = out / MANIFEST_FILE
    merged: dict[str, dict[str, object]] = {}
    if manifest_path.is_file():
        for entry in json.loads(manifest_path.read_text())["games"]:
            merged[str(entry["slug"])] = entry
    for manifest in baked:
        merged[manifest.slug] = asdict(manifest)

    manifest_path.write_text(json.dumps({"games": [merged[k] for k in sorted(merged)]}, indent=1))

    slice_bytes = sum(a.bytes for a in baked[0].assets if a.tier == "slice") if baked else 0
    log.info(
        "baked",
        rebuilt=rebuilt,
        up_to_date=len(games) - rebuilt,
        slice_mb=round(slice_bytes / 1048576, 2),
    )
    typer.echo(f"→ {manifest_path}")


def _baked_game(entry: dict[str, Any]) -> BakedGame:
    return BakedGame(**{**entry, "assets": [Asset(**a) for a in entry["assets"]]})


@app.command()
def publish(
    out: Annotated[Path, typer.Option()] = DEFAULT_OUT,
    source: Annotated[Path, typer.Option(envvar="SOURCE_BUNDLE_DIR")] = DEFAULT_SOURCE,
    backend: Annotated[str, typer.Option(help="local | supabase")] = "local",
    local_root: Annotated[
        Path | None, typer.Option(help="Target dir for the local backend")
    ] = None,
    bucket: Annotated[str, typer.Option(envvar="STORAGE_BUCKET")] = "game-bundles",
    supabase_url: Annotated[str, typer.Option(envvar="SUPABASE_URL")] = "",
    service_role_key: Annotated[str, typer.Option(envvar="SUPABASE_SERVICE_ROLE_KEY")] = "",
    api_base_url: Annotated[str, typer.Option(envvar="API_BASE_URL")] = "http://localhost:8000",
    internal_key: Annotated[str, typer.Option(envvar="INTERNAL_API_KEY")] = "",
    dry_run: Annotated[bool, typer.Option(help="Print the plan without writing")] = True,
    skip_register: Annotated[bool, typer.Option(help="Upload only")] = False,
) -> None:
    """Upload the baked catalogue and register it with the API."""
    manifest_path = out / MANIFEST_FILE
    if not manifest_path.is_file():
        raise typer.BadParameter(f"{manifest_path} not found — run `skin-baker bake` first.")

    games = [_baked_game(entry) for entry in json.loads(manifest_path.read_text())["games"]]

    storage: Storage
    if backend == "local":
        if local_root is None:
            raise typer.BadParameter("--local-root is required for the local backend")
        storage = LocalStorage(local_root)
    elif backend == "supabase":
        if not (supabase_url and service_role_key):
            raise typer.BadParameter("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        storage = SupabaseStorage(
            url=supabase_url, service_role_key=service_role_key, bucket=bucket
        )
    else:
        raise typer.BadParameter(f"unknown backend {backend!r}")

    uploaded, skipped = upload_catalogue(
        games, storage=storage, source=source, out=out, dry_run=dry_run
    )
    log.info(
        "uploaded",
        backend=backend,
        uploaded=uploaded,
        already_present=skipped,
        dry_run=dry_run,
    )

    if skip_register:
        return
    if not internal_key and not dry_run:
        raise typer.BadParameter("INTERNAL_API_KEY is required to register the manifest")
    register(games, api_base_url=api_base_url, internal_key=internal_key, dry_run=dry_run)


@app.command("all")
def run_all(
    trace: Annotated[Path, typer.Option(help="Recorded load for classify")],
    source: Annotated[Path, typer.Option(envvar="SOURCE_BUNDLE_DIR")] = DEFAULT_SOURCE,
    catalogue: Annotated[Path, typer.Option()] = DEFAULT_CATALOGUE,
    out: Annotated[Path, typer.Option()] = DEFAULT_OUT,
    local_root: Annotated[Path | None, typer.Option()] = None,
    dry_run: Annotated[bool, typer.Option()] = True,
) -> None:
    """classify → bake → publish, for a local run."""
    classify(trace=trace, out=out)
    bake(source=source, catalogue=catalogue, out=out)
    publish(
        out=out,
        source=source,
        backend="local",
        local_root=local_root,
        dry_run=dry_run,
        skip_register=True,
    )


if __name__ == "__main__":
    app()
