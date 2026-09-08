"""Upload behaviour. The shared/skinned split is the catalogue's economics."""

from pathlib import Path

from skin_baker.bake import Asset, BakedGame
from skin_baker.publish import LocalStorage, content_type, upload_catalogue

SHARED = "assets/core-engine.js"
SKINNED = "assets/images/@1x/symbols.webp"


def _game(slug: str, version: str) -> BakedGame:
    return BakedGame(
        slug=slug,
        name=slug,
        provider="E-Gaming",
        tag=None,
        symbol=None,
        gradient=None,
        jackpot=None,
        skin_hue=1.0,
        skin_sat=0.5,
        skin_val=0.5,
        bundle_version=version,
        engine_version="engine1",
        assets=[
            Asset(path=SKINNED, bytes=1, content_hash="a", tier="slice", is_skinned=True),
            Asset(path=SHARED, bytes=1, content_hash="b", tier="slice", is_skinned=False),
        ],
    )


def _tree(tmp_path: Path, slugs: list[str]) -> tuple[Path, Path]:
    source = tmp_path / "bundle"
    (source / SHARED).parent.mkdir(parents=True, exist_ok=True)
    (source / SHARED).write_text("engine")

    out = tmp_path / "out"
    for slug in slugs:
        path = out / "games" / slug / SKINNED
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(slug)
    return source, out


def test_shared_assets_are_uploaded_once_for_the_whole_catalogue(tmp_path: Path) -> None:
    """Without this the 27 MB of shared audio would be stored 30 times."""
    slugs = [f"game-{i}" for i in range(5)]
    source, out = _tree(tmp_path, slugs)
    storage = LocalStorage(tmp_path / "cdn")

    uploaded, skipped = upload_catalogue(
        [_game(s, f"v{i}") for i, s in enumerate(slugs)],
        storage=storage,
        source=source,
        out=out,
        dry_run=False,
    )

    assert uploaded == len(slugs) + 1  # 5 skin packs + 1 shared engine
    assert skipped == 0
    assert (tmp_path / "cdn/_shared/engine1" / SHARED).is_file()
    assert (tmp_path / "cdn/game-0/v0" / SKINNED).is_file()


def test_republish_skips_objects_that_already_exist(tmp_path: Path) -> None:
    """Every key carries a content hash, so a present object is the right bytes."""
    source, out = _tree(tmp_path, ["game-0"])
    storage = LocalStorage(tmp_path / "cdn")
    games = [_game("game-0", "v0")]

    upload_catalogue(games, storage=storage, source=source, out=out, dry_run=False)
    uploaded, skipped = upload_catalogue(
        games, storage=storage, source=source, out=out, dry_run=False
    )

    assert uploaded == 0
    assert skipped == 2


def test_dry_run_writes_nothing(tmp_path: Path) -> None:
    source, out = _tree(tmp_path, ["game-0"])
    cdn = tmp_path / "cdn"
    uploaded, _ = upload_catalogue(
        [_game("game-0", "v0")], storage=LocalStorage(cdn), source=source, out=out, dry_run=True
    )
    assert uploaded == 2
    assert not cdn.exists()


def test_a_new_bundle_version_gets_a_new_key(tmp_path: Path) -> None:
    """Versions are in the path, so nothing is ever overwritten or invalidated."""
    source, out = _tree(tmp_path, ["game-0"])
    storage = LocalStorage(tmp_path / "cdn")

    upload_catalogue(
        [_game("game-0", "v0")], storage=storage, source=source, out=out, dry_run=False
    )
    upload_catalogue(
        [_game("game-0", "v1")], storage=storage, source=source, out=out, dry_run=False
    )

    assert (tmp_path / "cdn/game-0/v0" / SKINNED).is_file()
    assert (tmp_path / "cdn/game-0/v1" / SKINNED).is_file()


def test_content_types_cover_the_bundle_formats() -> None:
    assert content_type(Path("a.webp")) == "image/webp"
    assert content_type(Path("a.ogg")) == "audio/ogg"
    assert content_type(Path("a.js")) == "application/javascript"
    assert content_type(Path("a.unknown")) == "application/octet-stream"
