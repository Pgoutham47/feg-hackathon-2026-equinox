"""Bake one game bundle: recolour its art, rename it, hash it.

Output layout, content-addressed so every published URL is immutable:

    out/games/<slug>/assets/...     the recoloured skin pack
    out/games/<slug>/thumb.webp     lobby tile art
    out/games/<slug>/.bake.json     stamp — lets a rebuild skip unchanged games
    out/manifest.json               every asset of every game, with tier + hash

Only files in SKIN_ART / SKIN_TEXT / the locale set are written per game. Every
other path in the manifest points at the shared bundle, which is uploaded once.
"""

import hashlib
import json
import shutil
from dataclasses import asdict, dataclass
from pathlib import Path

import structlog
from PIL import Image

from skin_baker.catalogue import GameEntry
from skin_baker.classify import Tier
from skin_baker.config import (
    BAKE_FORMAT_VERSION,
    LOCALE_FILE,
    SKIN_ART,
    SKIN_TEXT,
    SOURCE_GAME_NAME,
)
from skin_baker.recolour import make_thumbnail, recolour, save_image

log = structlog.get_logger(__name__)

ASSET_PREFIX = "assets"


@dataclass(frozen=True, slots=True)
class Asset:
    path: str  # bundle-relative, e.g. "assets/images/@1x/symbols.webp"
    bytes: int
    content_hash: str
    tier: Tier
    is_skinned: bool


@dataclass(frozen=True, slots=True)
class BakedGame:
    slug: str
    name: str
    provider: str
    tag: str | None
    symbol: str | None
    gradient: str | None
    jackpot: str | None
    skin_hue: float
    skin_sat: float
    skin_val: float
    bundle_version: str
    engine_version: str
    assets: list[Asset]
    # Lobby tile art, cut from this game's own recoloured splash. Not a game
    # asset — the lobby needs it, the game never requests it — so it is carried
    # separately rather than given a tier.
    has_thumbnail: bool = False


def file_hash(path: Path) -> str:
    """First 16 hex of sha256 — 64 bits, ample for addressing ~5k files."""
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()[:16]


def _version_of(entries: list[tuple[str, str]]) -> str:
    """Deterministic version over (path, hash) pairs — order-independent."""
    digest = hashlib.sha256()
    for path, content in sorted(entries):
        digest.update(f"{path}:{content}\n".encode())
    return digest.hexdigest()[:16]


def locale_files(source: Path) -> list[str]:
    locale_root = source / ASSET_PREFIX / "locale"
    if not locale_root.is_dir():
        return []
    return [
        f"{ASSET_PREFIX}/locale/{d.name}/{LOCALE_FILE}"
        for d in sorted(locale_root.iterdir())
        if (d / LOCALE_FILE).is_file()
    ]


def skinned_paths(source: Path) -> list[str]:
    """Every path this baker rewrites per game, in bundle-relative form."""
    return [
        *(f"{ASSET_PREFIX}/{rel}" for rel in SKIN_ART),
        *(f"{ASSET_PREFIX}/{rel}" for rel in SKIN_TEXT),
        *locale_files(source),
    ]


def engine_version(source: Path, tiers: dict[str, Tier]) -> str:
    """Version of the shared half — everything no game skins."""
    skinned = set(skinned_paths(source))
    shared = [p for p in tiers if p not in skinned and (source / p).is_file()]
    return _version_of([(p, file_hash(source / p)) for p in shared])


def bake_game(
    game: GameEntry,
    *,
    source: Path,
    out: Path,
    tiers: dict[str, Tier],
    engine: str,
    force: bool = False,
) -> tuple[BakedGame, bool]:
    """Returns the baked game and whether it was rebuilt (False = already current)."""
    root = out / "games" / game.slug
    stamp_path = root / ".bake.json"
    stamp = {
        "format": BAKE_FORMAT_VERSION,
        "skin": asdict(game.skin),
        "name": game.name,
        "engine": engine,
    }

    if not force and stamp_path.is_file():
        try:
            if json.loads(stamp_path.read_text()) == stamp:
                return _manifest_for(game, source, root, tiers, engine), False
        except (json.JSONDecodeError, OSError):
            pass  # unreadable stamp is just a cache miss

    shutil.rmtree(root, ignore_errors=True)
    hue, sat, val = game.skin.hue, game.skin.sat, game.skin.val

    # The @0.5x and @1x logo frames are byte-identical in the source bundle;
    # recolouring each one twice doubles the slowest part of the bake for nothing.
    already_written: dict[tuple[int, str], Path] = {}

    for rel in SKIN_ART:
        src = source / ASSET_PREFIX / rel
        if not src.is_file():
            continue
        dst = root / ASSET_PREFIX / rel
        key = (src.stat().st_size, src.name)
        if key in already_written:
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.hardlink_to(already_written[key])
            continue
        with Image.open(src) as image:
            save_image(recolour(image, hue, sat, val), dst)
        already_written[key] = dst

    for rel in SKIN_TEXT:
        src = source / ASSET_PREFIX / rel
        if not src.is_file():
            continue
        dst = root / ASSET_PREFIX / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(src.read_text(encoding="utf-8").replace(SOURCE_GAME_NAME, game.name))

    for rel in locale_files(source):
        content = json.loads((source / rel).read_text(encoding="utf-8"))
        renamed = {
            key: (value.replace(SOURCE_GAME_NAME, game.name) if isinstance(value, str) else value)
            for key, value in content.items()
        }
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(json.dumps(renamed, ensure_ascii=False), encoding="utf-8")

    splash = root / ASSET_PREFIX / "images/@1x/splashBG.jpg"
    if splash.is_file():
        make_thumbnail(splash, root / "thumb.webp", game.id)

    stamp_path.write_text(json.dumps(stamp))
    return _manifest_for(game, source, root, tiers, engine), True


THUMBNAIL_NAME = "thumb.webp"


def _manifest_for(
    game: GameEntry, source: Path, root: Path, tiers: dict[str, Tier], engine: str
) -> BakedGame:
    skinned = {p for p in skinned_paths(source) if (root / p).is_file()}

    assets: list[Asset] = []
    for path, tier in sorted(tiers.items()):
        on_disk = (root / path) if path in skinned else (source / path)
        if not on_disk.is_file():
            continue
        assets.append(
            Asset(
                path=path,
                bytes=on_disk.stat().st_size,
                content_hash=file_hash(on_disk),
                tier=tier,
                is_skinned=path in skinned,
            )
        )

    thumbnail = root / THUMBNAIL_NAME
    has_thumbnail = thumbnail.is_file()

    # The thumbnail is derived from the skinned splash, so it belongs in the
    # version hash: a reskin must produce a new thumbnail URL too.
    version_inputs = [(a.path, a.content_hash) for a in assets if a.is_skinned]
    if has_thumbnail:
        version_inputs.append((THUMBNAIL_NAME, file_hash(thumbnail)))
    bundle_version = _version_of(version_inputs)
    return BakedGame(
        slug=game.slug,
        name=game.name,
        provider=game.provider,
        tag=game.tag,
        symbol=game.symbol,
        gradient=game.gradient,
        jackpot=str(game.jackpot) if game.jackpot is not None else None,
        skin_hue=game.skin.hue,
        skin_sat=game.skin.sat,
        skin_val=game.skin.val,
        bundle_version=bundle_version,
        engine_version=engine,
        assets=assets,
        has_thumbnail=has_thumbnail,
    )
