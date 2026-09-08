"""The catalogue file — the single input both the bake and the lobby read."""

import json
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Self


@dataclass(frozen=True, slots=True)
class Skin:
    hue: float
    sat: float
    val: float


@dataclass(frozen=True, slots=True)
class GameEntry:
    id: int
    slug: str
    name: str
    provider: str
    skin: Skin
    tag: str | None = None
    symbol: str | None = None
    gradient: str | None = None
    jackpot: Decimal | None = None

    @classmethod
    def from_json(cls, raw: dict[str, Any]) -> Self:
        skin = raw["skin"]
        jackpot = raw.get("jackpot")
        return cls(
            id=int(raw["id"]),
            slug=str(raw["slug"]),
            name=str(raw["name"]),
            provider=str(raw["provider"]),
            skin=Skin(hue=float(skin["hue"]), sat=float(skin["sat"]), val=float(skin["val"])),
            tag=raw.get("tag"),
            symbol=raw.get("sym"),
            gradient=raw.get("grad"),
            jackpot=Decimal(str(jackpot)) if jackpot is not None else None,
        )


def load_catalogue(path: Path, only: list[str] | None = None) -> list[GameEntry]:
    games = [GameEntry.from_json(raw) for raw in json.loads(path.read_text())]

    slugs = [g.slug for g in games]
    duplicates = {s for s in slugs if slugs.count(s) > 1}
    if duplicates:
        raise ValueError(f"duplicate slugs in {path}: {', '.join(sorted(duplicates))}")

    if only:
        known = {g.slug for g in games}
        unknown = set(only) - known
        if unknown:
            raise ValueError(f"unknown slugs: {', '.join(sorted(unknown))}")
        games = [g for g in games if g.slug in set(only)]

    return games
