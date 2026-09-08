"""Bake behaviour: versioning, idempotency, and what is skinned vs shared."""

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from skin_baker.bake import bake_game, engine_version, file_hash
from skin_baker.catalogue import GameEntry, Skin, load_catalogue
from skin_baker.classify import Tier
from skin_baker.config import SKIN_ART, SKIN_TEXT, SOURCE_GAME_NAME

TIERS: dict[str, Tier] = {
    "assets/images/@1x/symbols.webp": "slice",
    "assets/images/@1x/splashBG.jpg": "slice",
    "assets/game-empireofgold-CK6MbOiD.js": "slice",
    "assets/core-engine.js": "slice",
    "assets/sounds/ogg/win.ogg": "audio",
}


@pytest.fixture
def source(tmp_path: Path) -> Path:
    """A miniature bundle with one skinned image, one skinned script, one shared file."""
    root = tmp_path / "bundle"
    for rel in ("assets/images/@1x/symbols.webp", "assets/images/@1x/splashBG.jpg"):
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        hsv = np.zeros((64, 64, 3), dtype=np.uint8)
        hsv[..., 0], hsv[..., 1], hsv[..., 2] = 28, 200, 180  # ~40deg, the source gold
        Image.fromarray(hsv, "HSV").convert("RGB").save(path)

    js = root / "assets/game-empireofgold-CK6MbOiD.js"
    js.write_text(f'const gameName = "{SOURCE_GAME_NAME}";')
    shared = root / "assets/core-engine.js"
    shared.write_text("// shared engine")
    audio = root / "assets/sounds/ogg/win.ogg"
    audio.parent.mkdir(parents=True, exist_ok=True)
    audio.write_bytes(b"OggS" + b"\0" * 64)
    return root


def _game(slug: str = "king-rhino", hue: float = 230.0, name: str = "King Rhino") -> GameEntry:
    return GameEntry(
        id=1, slug=slug, name=name, provider="E-Gaming", skin=Skin(hue=hue, sat=0.7, val=0.8)
    )


def _bake(game: GameEntry, source: Path, out: Path, **kw: object):  # type: ignore[no-untyped-def]
    engine = engine_version(source, TIERS)
    return bake_game(game, source=source, out=out, tiers=TIERS, engine=engine, **kw)  # type: ignore[arg-type]


def test_only_identity_art_is_skinned(source: Path, tmp_path: Path) -> None:
    """The shared engine must never end up in a per-game pack.

    If it does, the catalogue costs 30 engines instead of one and the prefetch
    budget maths in the policy is wrong.
    """
    manifest, _ = _bake(_game(), source, tmp_path / "out")
    by_path = {a.path: a for a in manifest.assets}

    assert by_path["assets/images/@1x/symbols.webp"].is_skinned
    assert by_path["assets/game-empireofgold-CK6MbOiD.js"].is_skinned
    assert not by_path["assets/core-engine.js"].is_skinned
    assert not by_path["assets/sounds/ogg/win.ogg"].is_skinned


def test_game_name_is_rewritten_in_the_skinned_script(source: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    _bake(_game(), source, out)
    baked = (out / "games/king-rhino/assets/game-empireofgold-CK6MbOiD.js").read_text()
    assert "King Rhino" in baked
    assert SOURCE_GAME_NAME not in baked


def test_two_skins_of_the_same_art_get_different_bundle_versions(
    source: Path, tmp_path: Path
) -> None:
    a, _ = _bake(_game("a", hue=14.0), source, tmp_path / "out")
    b, _ = _bake(_game("b", hue=230.0), source, tmp_path / "out")
    assert a.bundle_version != b.bundle_version
    # ...but they share one engine, which is the whole economics of the catalogue.
    assert a.engine_version == b.engine_version


def test_rebake_is_idempotent_and_skips_unchanged_games(source: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    first, built_first = _bake(_game(), source, out)
    second, built_second = _bake(_game(), source, out)

    assert built_first is True
    assert built_second is False
    assert first.bundle_version == second.bundle_version


def test_changing_the_skin_forces_a_rebuild(source: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    before, _ = _bake(_game(hue=14.0), source, out)
    after, rebuilt = _bake(_game(hue=230.0), source, out)

    assert rebuilt is True
    assert before.bundle_version != after.bundle_version


def test_force_rebuilds_even_when_current(source: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    _bake(_game(), source, out)
    _, rebuilt = _bake(_game(), source, out, force=True)
    assert rebuilt is True


def test_engine_version_ignores_skinned_files(source: Path, tmp_path: Path) -> None:
    """Reskinning a game must not invalidate the shared engine for the other 29."""
    before = engine_version(source, TIERS)
    (source / "assets/images/@1x/symbols.webp").write_bytes(
        (source / "assets/images/@1x/splashBG.jpg").read_bytes()
    )
    assert engine_version(source, TIERS) == before

    (source / "assets/core-engine.js").write_text("// changed")
    assert engine_version(source, TIERS) != before


def test_asset_hashes_match_the_bytes_actually_published(source: Path, tmp_path: Path) -> None:
    out = tmp_path / "out"
    manifest, _ = _bake(_game(), source, out)
    for asset in manifest.assets:
        local = out / "games/king-rhino" / asset.path if asset.is_skinned else source / asset.path
        assert file_hash(local) == asset.content_hash
        assert local.stat().st_size == asset.bytes


def test_catalogue_rejects_duplicate_slugs(tmp_path: Path) -> None:
    path = tmp_path / "games.json"
    entry = {
        "id": 1,
        "slug": "dup",
        "name": "A",
        "provider": "P",
        "skin": {"hue": 1.0, "sat": 0.5, "val": 0.5},
    }
    path.write_text(json.dumps([entry, {**entry, "id": 2, "name": "B"}]))
    with pytest.raises(ValueError, match="duplicate slugs"):
        load_catalogue(path)


def test_skin_art_lists_both_resolutions() -> None:
    # A skin that recolours only @1x leaves retina devices on the source gold.
    assert any(p.startswith("images/@0.5x/") for p in SKIN_ART)
    assert any(p.startswith("images/@1x/") for p in SKIN_ART)
    assert SKIN_TEXT
