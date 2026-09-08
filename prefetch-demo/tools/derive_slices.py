#!/usr/bin/env python3
"""Derive the real load stages of the certified Empire of Gold bundle.

Nothing here is hand-written. The stage membership is read out of the bundle's
own asset config, and the file paths are produced by re-implementing exactly what
`AssetManager.createAssetsManifest()` / `createPathMap()` in
`assets/core-engine-*.js` do at runtime, plus the follow-on fetches that Pixi
performs from the files those paths point at:

  * a spine  -> .json + .atlas, then every page image named inside the .atlas
  * a sprite -> .json, then the image named in its `meta.image`
  * a bmpfont-> .fnt, then every page named inside the .fnt
  * a sound  -> assets/sounds/ogg/<name>.ogg?version=<gameVersion>

The bundle loads its stages strictly in order:

    PRELOADER -> COMMON -> SPLASH -> PRIMARY -> SECONDARY

After SPLASH the game paints splash art *with a loading bar*. The Play button is
only created in `onPrimaryLoaded()`, which fires on `PRIMARY_ASSETS_LOADED`. So
"Play-ready" is the end of PRIMARY, not the end of SPLASH — which is why the
prototype's old 27-file `_slice.json` is the wrong set for this purpose.

There is no FEATURES bundle in this game: the asset config is `[We,He,Re,Me,Fe]`,
five stages, and `loadFeatures()` finds no such bundle and loads nothing.

Usage:
    python3 tools/derive_slices.py                     # writes site/slices.json
    python3 tools/derive_slices.py --trace trace.json  # also cross-check a load
    python3 tools/derive_slices.py --resolution @0.5x  # phone asset resolution
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
DEMO = TOOLS.parent
REPO = DEMO.parent
BUNDLE = REPO  # the certified bundle: repo-root index.html + assets/

STAGES = ["PRELOADER", "COMMON", "SPLASH", "PRIMARY", "SECONDARY"]

# The bundle's own entry document. What it references is read out of the file
# rather than hard-coded, so the content hashes in the script names and the `?v=`
# cache-busters on the stylesheets stay correct on their own. The query string is
# part of a Cache Storage key, so it has to survive verbatim into the slice.
BOOT_HTML = "index.html"

HREF_RE = re.compile(
    r"""<(?:link|script|img)\b[^>]*?\b(?:href|src)\s*=\s*["']([^"']+)["']""",
    re.IGNORECASE,
)


def read_boot_files(index_html: Path) -> list[str]:
    """Every subresource index.html references, in document order."""
    out = []
    for raw in HREF_RE.findall(index_html.read_text(encoding="utf-8")):
        if raw.startswith(("data:", "http:", "https:", "//", "#")):
            continue
        out.append(raw.lstrip("./"))
    return dedupe(out)

# Never prefetch these.
EXCLUDE_EXACT = {
    # A developer cheat tool. It is requested on every load but must not be
    # shipped to players, let alone paid for on the critical path.
    "assets/panel/devUtils/cheatTool.css",
    # Referenced by book.atlas but absent from the bundle: 404s on every load.
    # Prefetching it would cache a 404 and waste a request.
    "assets/spines/@1x/book.png",
    "assets/spines/@0.5x/book.png",
}


def die(msg: str) -> None:
    print(f"error: {msg}", file=sys.stderr)
    raise SystemExit(1)


# --------------------------------------------------------------------------
# 1. Read the stage config out of the game bundle
# --------------------------------------------------------------------------

STAGE_RE = re.compile(
    r"name:[A-Za-z_$]+\.(" + "|".join(STAGES) + r")\s*,\s*assets:\s*\["
)
ENTRY_RE = re.compile(r"\{([^{}]*)\}")
FIELD_RE = re.compile(r"(TYPE|NAME|ASSETTYPE):\s*\"([^\"]*)\"")


def match_bracket(text: str, start: int, open_c: str = "[", close_c: str = "]") -> int:
    """Index just past the bracket that opens at `start`."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == open_c:
            depth += 1
        elif text[i] == close_c:
            depth -= 1
            if depth == 0:
                return i + 1
    die("unbalanced brackets in the game bundle")
    return -1  # unreachable


def read_stage_config(game_js: Path) -> dict[str, list[dict[str, str]]]:
    src = game_js.read_text(encoding="utf-8")
    config: dict[str, list[dict[str, str]]] = {}
    for m in STAGE_RE.finditer(src):
        stage = m.group(1)
        start = m.end() - 1
        body = src[start : match_bracket(src, start)]
        entries = []
        for e in ENTRY_RE.finditer(body):
            fields = dict(FIELD_RE.findall(e.group(1)))
            if "NAME" in fields:
                entries.append(fields)
        config[stage] = entries
    missing = [s for s in STAGES if s not in config]
    if missing:
        die(f"stages not found in {game_js.name}: {missing}")
    return config


def read_sound_config(game_js: Path) -> tuple[list[str], list[str]]:
    """`soundFiles` load right after PRIMARY; `lazySoundFiles` come later."""
    src = game_js.read_text(encoding="utf-8")
    out = []
    for key in ("soundFiles:", "lazySoundFiles:"):
        i = src.find(key)
        if i < 0:
            die(f"{key} not found in {game_js.name}")
        start = src.index("[", i)
        body = src[start : match_bracket(src, start)]
        out.append(re.findall(r"name:\"([^\"]+)\"", body))
    return out[0], out[1]


def read_game_version(game_js: Path) -> str:
    m = re.search(r"gameVersion:\"([^\"]+)\"", game_js.read_text(encoding="utf-8"))
    return m.group(1) if m else "0.0"


# --------------------------------------------------------------------------
# 2. Re-implement createPathMap() / createAssetsManifest()
# --------------------------------------------------------------------------


class Paths:
    """Mirrors AssetManager.createPaths() in core-engine."""

    def __init__(self, resolution: str, language: str) -> None:
        self.env = "assets/env/"
        self.sprite = f"assets/images/{resolution}/"
        self.font = "assets/fonts/en/"
        self.common_font = "assets/fonts/en/"
        self.bmp_font = "assets/fonts/bmp/"
        self.spine = f"assets/spines/{resolution}/"
        self.common = f"assets/images/{resolution}/"
        self.content = f"assets/locale/{language}/"
        self.common_content = f"assets/locale/{language}/"
        self.sound = "assets/sounds/"
        self.lang_sprite = f"assets/images/{resolution}/{language}/"
        self.lang_spine = f"assets/spines/{resolution}/{language}/"

    def base_for(self, type_: str, asset_type: str) -> str:
        """createPathMap()[TYPE](NAME, ASSETTYPE), as a directory prefix."""
        if type_ == "commonConfig":
            return self.env
        if type_ == "content":
            return self.content
        if type_ == "commoncontent":
            return self.common_content
        if type_ == "common":
            return {
                "spine": self.spine,
                "atlas": self.spine,
                "sprite": self.common,
                "sound": self.sound,
                "font": self.common_font,
                "bmpfont": self.bmp_font,
            }.get(asset_type, "assets/")
        if type_ == "game":
            return {
                "spine": self.spine,
                "atlas": self.spine,
                "sprite": self.sprite,
                "sound": "canvas/assets/sounds/",
                "font": self.font,
                "bmpfont": self.bmp_font,
            }.get(asset_type, self.sprite)
        if type_ == "lang":
            return {
                "spine": self.lang_spine,
                "atlas": self.lang_spine,
                "sprite": self.lang_sprite,
            }.get(asset_type, self.sprite)
        return self.sprite


DIRECT_IMAGE_TYPES = {"svg", "png", "jpg", "gif", "webp"}


def atlas_pages(atlas: Path) -> list[str]:
    """Page image names declared in a spine .atlas (one per page block)."""
    pages = []
    for line in atlas.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if line.lower().endswith((".png", ".webp", ".jpg")):
            pages.append(line)
    return pages


def fnt_pages(fnt: Path) -> list[str]:
    text = fnt.read_text(encoding="utf-8", errors="replace")
    return re.findall(r'page\s+id=\d+\s+file="([^"]+)"', text)


def sheet_image(sheet: Path) -> str | None:
    try:
        meta = json.loads(sheet.read_text(encoding="utf-8")).get("meta", {})
    except (json.JSONDecodeError, OSError):
        return None
    image = meta.get("image")
    return image if isinstance(image, str) else None


def expand(entry: dict[str, str], paths: Paths) -> list[str]:
    """One asset-config entry -> every file the browser ends up requesting."""
    type_ = entry.get("TYPE", "game")
    name = entry["NAME"]
    asset_type = entry.get("ASSETTYPE", "")
    out: list[str] = []

    if asset_type in DIRECT_IMAGE_TYPES:
        base = (
            paths.common
            if type_ == "common"
            else paths.lang_sprite if type_ == "lang" else paths.sprite
        )
        out.append(f"{base}{name}.{asset_type}")
        return out

    if asset_type == "spine":
        base = paths.lang_spine if type_ == "lang" else paths.spine
        out.append(f"{base}{name}.json")
        atlas_rel = f"{base}{name}.atlas"
        out.append(atlas_rel)
        atlas_file = BUNDLE / atlas_rel
        if atlas_file.is_file():
            # The runtime pushes `<name>.png`; the real page list lives in the
            # atlas and is often longer (king_character has 3, jakpots has 7).
            out.extend(f"{base}{p}" for p in atlas_pages(atlas_file))
        else:
            out.append(f"{base}{name}.png")
        return out

    base = paths.base_for(type_, asset_type)

    if asset_type == "sprite":
        sheet_rel = f"{base}{name}.json"
        out.append(sheet_rel)
        sheet = BUNDLE / sheet_rel
        image = sheet_image(sheet) if sheet.is_file() else None
        out.append(f"{base}{image}" if image else f"{base}{name}.webp")
        return out

    if asset_type == "bmpfont":
        out.append(f"{base}{name}")
        fnt = BUNDLE / f"{base}{name}"
        if fnt.is_file():
            out.extend(f"{base}{p}" for p in fnt_pages(fnt))
        return out

    # font, content, commoncontent, commonConfig: NAME already carries the suffix.
    out.append(f"{base}{name}")
    return out


def sound_urls(names: list[str], version: str) -> list[str]:
    """Howler is handed [ogg, mp3] and fetches only the first format it can play.

    Every browser this demo targets plays ogg, so the mp3 twin is never
    requested and must not be prefetched.
    """
    return [f"assets/sounds/ogg/{n}.ogg?version={version}" for n in names]


# --------------------------------------------------------------------------
# 3. Assemble the slices
# --------------------------------------------------------------------------


def dedupe(paths: list[str]) -> list[str]:
    seen: set[str] = set()
    out = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def strip_query(p: str) -> str:
    return p.split("?", 1)[0]


def size_of(p: str) -> int:
    f = BUNDLE / strip_query(p)
    return f.stat().st_size if f.is_file() else 0


def mb(n: int) -> str:
    return f"{n / 1_048_576:.2f} MB"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--resolution", default="@1x", choices=["@1x", "@0.5x"])
    ap.add_argument("--language", default="en")
    ap.add_argument("--out", default=str(DEMO / "site" / "slices.json"))
    ap.add_argument(
        "--trace",
        help="JSON array of URLs from a recorded cold load, to cross-check against",
    )
    args = ap.parse_args()

    game_js = next(iter(sorted((BUNDLE / "assets").glob("game-empireofgold-*.js"))), None)
    if game_js is None:
        die("no assets/game-empireofgold-*.js found")

    paths = Paths(args.resolution, args.language)
    config = read_stage_config(game_js)
    eager_sounds, lazy_sounds = read_sound_config(game_js)
    version = read_game_version(game_js)

    per_stage: dict[str, list[str]] = {}
    for stage in STAGES:
        files: list[str] = []
        for entry in config[stage]:
            files.extend(expand(entry, paths))
        per_stage[stage] = dedupe(files)

    index_html = BUNDLE / BOOT_HTML
    if not index_html.is_file():
        die(f"{BOOT_HTML} not found at the repo root")
    boot = dedupe([BOOT_HTML, *read_boot_files(index_html)])

    to_splash = dedupe(
        [*boot, *per_stage["PRELOADER"], *per_stage["COMMON"], *per_stage["SPLASH"]]
    )
    to_play = dedupe([*to_splash, *per_stage["PRIMARY"]])
    after_play = dedupe(
        [
            *per_stage["SECONDARY"],
            *sound_urls(eager_sounds, version),
            *sound_urls(lazy_sounds, version),
        ]
    )

    def clean(paths_: list[str]) -> list[str]:
        return [p for p in paths_ if strip_query(p) not in EXCLUDE_EXACT]

    to_splash, to_play = clean(to_splash), clean(to_play)
    after_play = [p for p in clean(after_play) if p not in to_play]

    missing = [p for p in to_splash + to_play + after_play if size_of(p) == 0]

    report: dict[str, object] = {}
    if args.trace:
        report = cross_check(Path(args.trace), to_play, after_play)

    payload = {
        "generatedBy": "tools/derive_slices.py",
        "bundleJs": game_js.name,
        "gameVersion": version,
        "assetResolution": args.resolution,
        "language": args.language,
        "note": (
            "toPlay is the end of the PRIMARY stage, which is when onPrimaryLoaded() "
            "creates the Play button. toSplash only reaches splash art with a "
            "loading bar. There is no FEATURES stage in this bundle."
        ),
        "stages": {s: per_stage[s] for s in STAGES},
        "toSplash": to_splash,
        "toPlay": to_play,
        "afterPlay": after_play,
        "bytes": {
            "toSplash": sum(size_of(p) for p in to_splash),
            "toPlay": sum(size_of(p) for p in to_play),
            "afterPlay": sum(size_of(p) for p in after_play),
        },
        "excluded": sorted(EXCLUDE_EXACT),
        "missingOnDisk": missing,
        "crossCheck": report,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1) + "\n", encoding="utf-8")

    print(f"bundle:     {game_js.name}  (gameVersion {version}, {args.resolution}, {args.language})")
    print()
    for stage in STAGES:
        files = per_stage[stage]
        print(f"  {stage:<10} {len(files):>3} files  {mb(sum(size_of(p) for p in files)):>10}")
    print(f"  {'boot':<10} {len(boot):>3} files  {mb(sum(size_of(p) for p in boot)):>10}")
    print()
    print(f"  toSplash   {len(to_splash):>3} files  {mb(payload['bytes']['toSplash']):>10}")
    print(f"  toPlay     {len(to_play):>3} files  {mb(payload['bytes']['toPlay']):>10}   <- Play button")
    print(f"  afterPlay  {len(after_play):>3} files  {mb(payload['bytes']['afterPlay']):>10}")
    print()
    if missing:
        print(f"  !! {len(missing)} derived paths are not on disk:")
        for p in missing:
            print(f"     {p}")
        print()
    if report:
        for line in report["lines"]:  # type: ignore[index]
            print(f"  {line}")
        print()
    print(f"wrote {out}")
    return 1 if missing or (report and not report.get("ok")) else 0


# --------------------------------------------------------------------------
# 4. Cross-check against a recorded cold load
# --------------------------------------------------------------------------


def normalise(url: str) -> str:
    """Recorded URL -> bundle-relative path, matching the trace recorder."""
    from urllib.parse import unquote

    path = unquote(url.split("?", 1)[0])
    if "://" in path:
        path = "/" + path.split("://", 1)[1].split("/", 1)[-1]
    path = path.lstrip("/")
    head, _, tail = path.partition("/")
    # The prototype server routes per-game bundles under /g7/ and /nocache/.
    if head == "nocache" or (head.startswith("g") and head[1:].isdigit()):
        path = tail
    return path


def cross_check(trace_path: Path, to_play: list[str], after_play: list[str]) -> dict:
    urls = json.loads(trace_path.read_text(encoding="utf-8"))
    observed = {normalise(u) for u in urls}
    derived = {strip_query(p) for p in to_play + after_play}

    # The bundle asks for these but they are deliberately not in any slice.
    ignorable = EXCLUDE_EXACT | {"report", "favicon.ico"}
    # The entry document is a navigation, not a resource, so it never appears in
    # a resource-timing trace - but it must still be in the slice.
    documents = {BOOT_HTML}

    missed = sorted(observed - derived - ignorable)
    extra = sorted(derived - observed - documents)

    lines = [f"cross-check vs {trace_path.name}: {len(observed)} URLs observed"]
    if missed:
        lines.append(f"  MISSING from slices ({len(missed)}):")
        lines += [f"    {p}" for p in missed]
    if extra:
        lines.append(f"  derived but never requested ({len(extra)}):")
        lines += [f"    {p}" for p in extra]
    if not missed and not extra:
        lines.append("  exact match - no missing files, no extras")
    return {"ok": not missed and not extra, "missed": missed, "extra": extra, "lines": lines}


if __name__ == "__main__":
    raise SystemExit(main())
