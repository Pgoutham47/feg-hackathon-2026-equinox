"""Derive the prefetch tiers from a recorded load.

The slice is measured, never hand-written: it is exactly the set of resources the
loader requested on the way to the Play screen. Hand-maintaining that list is how
it silently goes stale after a bundle change, which degrades every prefetched
load back to baseline with no error anywhere.

Input is either

  * the JSONL the prototype's instrumentation posts to /report — records carrying
    `timeline` (every resource with start/end) and `splashReady`; or
  * a HAR file, from which the same two things are reconstructed.

This reproduces the prototype's hand-derived `_slice.json` exactly (27 files) on
every recorded run, cold and warm.
"""

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote

Tier = Literal["slice", "animation", "audio", "rest"]

# Big-win art: on screen only after a win lands, so it is worth its own tier.
ANIMATION_MARKERS = ("bigwins",)
AUDIO_SUFFIXES = (".ogg", ".mp3", ".m4a", ".wav")


@dataclass(frozen=True, slots=True)
class Trace:
    """One recorded cold load."""

    splash_ready_ms: int
    resources: tuple[tuple[str, int], ...]  # (path, start_ms)

    @property
    def slice_paths(self) -> set[str]:
        return {path for path, start in self.resources if start <= self.splash_ready_ms}

    @property
    def all_paths(self) -> set[str]:
        return {path for path, _ in self.resources}


def normalise(url: str) -> str:
    """Reduce a recorded URL to a bundle-relative path.

    Strips the query (the bundle cache-busts with ?v=), any origin, and the
    per-game or no-cache routing prefix the prototype's server used, then
    percent-decodes: many sound files have spaces in their names, and leaving
    them encoded silently drops the whole audio tier from the manifest.
    """
    path = unquote(url.split("?", 1)[0])
    if "://" in path:
        path = "/" + path.split("://", 1)[1].split("/", 1)[-1]
    path = path.lstrip("/")
    head, _, tail = path.partition("/")
    if head == "nocache" or (head.startswith("g") and head[1:].isdigit()):
        path = tail
    return path


def load_traces(path: Path) -> list[Trace]:
    if path.suffix == ".har":
        return [_trace_from_har(json.loads(path.read_text()))]

    traces: list[Trace] = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(record, dict):
            continue
        timeline, splash = record.get("timeline"), record.get("splashReady")
        if not isinstance(timeline, list) or not isinstance(splash, int):
            continue
        traces.append(
            Trace(
                splash_ready_ms=splash,
                resources=tuple(
                    (normalise(str(e["u"])), int(e.get("st", 0)))
                    for e in timeline
                    if isinstance(e, dict) and "u" in e
                ),
            )
        )
    if not traces:
        raise ValueError(f"no usable traces in {path} (need `timeline` and `splashReady`)")
    return traces


def _trace_from_har(har: dict[str, Any]) -> Trace:
    """HAR has no splashReady, so reconstruct it from the splash-critical set."""
    entries = har.get("log", {}).get("entries", [])
    if not entries:
        raise ValueError("HAR contains no entries")

    origin = min(e["startedDateTime"] for e in entries)
    resources: list[tuple[str, int]] = []
    splash_end = 0
    splash_markers = (
        "splashBG.jpg",
        "splashAssets.webp",
        "EOG_Logo_Anim.png",
        "controlPanelPrimaryAssets.webp",
        "brandLogo.png",
    )
    for entry in entries:
        path = normalise(entry["request"]["url"])
        start = _offset_ms(entry["startedDateTime"], origin)
        resources.append((path, start))
        if any(marker in path for marker in splash_markers):
            splash_end = max(splash_end, start + int(entry.get("time", 0)))

    if splash_end == 0:
        raise ValueError("HAR has no splash-critical resources; cannot locate the Play screen")
    return Trace(splash_ready_ms=splash_end, resources=tuple(resources))


def _offset_ms(when: str, origin: str) -> int:
    from datetime import datetime

    delta = datetime.fromisoformat(when) - datetime.fromisoformat(origin)
    return int(delta.total_seconds() * 1000)


def classify(traces: list[Trace], *, quorum: float = 0.5) -> dict[str, Tier]:
    """Assign every observed resource a tier.

    A path joins the slice when it appears before the Play screen in at least
    `quorum` of the runs. One run is enough to derive a slice, but a single run
    can also catch a race — a file that usually arrives after the Play screen and
    happened to land early — and paying for that file on every device forever is
    a worse outcome than leaving it out.
    """
    if not traces:
        raise ValueError("no traces to classify")

    in_slice: Counter[str] = Counter()
    for trace in traces:
        in_slice.update(trace.slice_paths)

    needed = max(1, round(len(traces) * quorum))
    tiers: dict[str, Tier] = {}
    for path in sorted({p for t in traces for p in t.all_paths}):
        if in_slice[path] >= needed:
            tiers[path] = "slice"
        elif any(marker in path for marker in ANIMATION_MARKERS):
            tiers[path] = "animation"
        elif path.endswith(AUDIO_SUFFIXES):
            tiers[path] = "audio"
        else:
            tiers[path] = "rest"
    return tiers
