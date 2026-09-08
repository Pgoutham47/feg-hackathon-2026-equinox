"""Seed the catalogue from the real game bundle.

Everything here is derived, not invented:
  - the 30 games come from prefetch-demo/site/games.json
  - the slice is the 27 paths in _slice.json, recorded by instrumenting a real
    cold load
  - byte sizes are stat()'d off the shipped bundle
  - skinned/shared matches SKIN_ART + SKIN_TEXT in build_skins.py, which is what
    decides whether a file costs per-game bytes or is free after the first game

Run:  uv run --project apps/api python scripts/seed.py [--reset]
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from pathlib import Path

from sqlalchemy import delete, select

from app.core.config import get_settings
from app.core.db import init_engine
from app.models import BundleAsset, Game

REPO_ROOT = Path(__file__).resolve().parents[3]
PROTOTYPE = REPO_ROOT / "prefetch-demo" / "site"
BUNDLE = REPO_ROOT

# Mirrors SKIN_ART / SKIN_TEXT in prefetch-demo/build_skins.py.
SKIN_ART = [
    *[
        f"assets/images/{res}/{name}"
        for res in ("@0.5x", "@1x")
        for name in (
            "splashBG.jpg",
            "splashAssets.webp",
            "symbols.webp",
            "gameElements.webp",
            "controlPanelPrimaryAssets.webp",
            "controlPanelAssets.webp",
            "brandLogo.png",
            "en/langImages.webp",
            "en/commonLangAssets.webp",
        )
    ],
    *[
        f"assets/spines/{res}/EOG_Logo_Anim{suffix}.png"
        for res in ("@0.5x", "@1x")
        for suffix in ("", "_2")
    ],
    "assets/images/loader.webp",
]
SKIN_TEXT = ["assets/game-empireofgold-CK6MbOiD.js"]
SKINNED = {*SKIN_ART, *SKIN_TEXT}


def tier_for(path: str) -> str:
    """Slice membership is measured; the other three are shaped by extension."""
    if "bigwins" in path:
        return "animation"
    if path.endswith((".ogg", ".mp3", ".m4a")):
        return "audio"
    return "rest"


def strip_query(path: str) -> str:
    return path.split("?", 1)[0]


def size_of(path: str) -> int:
    f = BUNDLE / strip_query(path)
    return f.stat().st_size if f.is_file() else 0


def content_hash(path: str, salt: str) -> str:
    """Real hash where the file exists; salted so each skin pack differs."""
    f = BUNDLE / strip_query(path)
    h = hashlib.sha256(salt.encode())
    if f.is_file():
        h.update(f.read_bytes()[:65536])
        h.update(str(f.stat().st_size).encode())
    return h.hexdigest()[:16]


async def main(reset: bool) -> None:
    settings = get_settings()
    engine = init_engine(settings)

    games = json.loads((PROTOTYPE / "games.json").read_text())
    slice_paths = [strip_query(p) for p in json.loads((PROTOTYPE / "_slice.json").read_text())]
    all_paths = [strip_query(p) for p in json.loads((PROTOTYPE / "_assets.json").read_text())]
    slice_set = set(slice_paths)
    other_paths = [p for p in all_paths if p not in slice_set]

    from sqlalchemy.ext.asyncio import async_sessionmaker

    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as session:
        if reset:
            await session.execute(delete(BundleAsset))
            await session.execute(delete(Game))
            await session.commit()

        existing = set((await session.scalars(select(Game.slug))).all())
        engine_version = content_hash("assets/core-engine-DXW-O-mj.js", "engine")

        created = 0
        for entry in games:
            if entry["slug"] in existing:
                continue
            bundle_version = content_hash("assets/images/@1x/symbols.webp", entry["slug"])
            game = Game(
                slug=entry["slug"],
                name=entry["name"],
                provider=entry["provider"],
                tag=entry.get("tag"),
                symbol=entry.get("sym"),
                gradient=entry.get("grad"),
                jackpot=entry.get("jackpot"),
                skin_hue=entry["skin"]["hue"],
                skin_sat=entry["skin"]["sat"],
                skin_val=entry["skin"]["val"],
                bundle_version=bundle_version,
                engine_version=engine_version,
                # Descending prior by catalogue position — a stand-in until real
                # play data accumulates and game_ranking takes over.
                popularity_prior=round(max(0.05, 1.0 - entry["id"] / len(games)), 3),
            )
            session.add(game)
            await session.flush()

            session.add_all(
                BundleAsset(
                    game_id=game.id,
                    bundle_version=bundle_version,
                    path=path,
                    content_hash=content_hash(path, entry["slug"]),
                    bytes=size_of(path),
                    tier=tier,
                    is_skinned=path in SKINNED,
                )
                for path, tier in (
                    *[(p, "slice") for p in slice_paths],
                    *[(p, tier_for(p)) for p in other_paths],
                )
            )
            created += 1

        await session.commit()

        slice_bytes = sum(size_of(p) for p in slice_paths)
        total_bytes = sum(size_of(p) for p in all_paths)
        print(f"seeded {created} games ({len(existing)} already present)")
        print(f"  slice: {len(slice_paths)} files, {slice_bytes / 1e6:.1f} MB")
        print(f"  total: {len(all_paths)} files, {total_bytes / 1e6:.1f} MB")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="delete existing rows first")
    asyncio.run(main(parser.parse_args().reset))
