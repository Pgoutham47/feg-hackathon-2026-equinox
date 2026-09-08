"""The classifier decides what every device downloads. It is worth pinning down."""

import json
from pathlib import Path

import pytest

from skin_baker.classify import Trace, classify, load_traces, normalise

REPO_ROOT = Path(__file__).resolve().parents[3]
REAL_TRACE = REPO_ROOT / "prefetch-demo" / "report.jsonl"
KNOWN_SLICE = REPO_ROOT / "prefetch-demo" / "site" / "_slice.json"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("/assets/images/symbols.webp", "assets/images/symbols.webp"),
        # Cache-busting query must not become part of the path.
        ("assets/panel/css/common.css?v=1788443825853", "assets/panel/css/common.css"),
        # The prototype's per-game and no-cache routing prefixes.
        ("/g7/assets/core-engine.js", "assets/core-engine.js"),
        ("/nocache/assets/core-engine.js", "assets/core-engine.js"),
        ("http://localhost:8150/g12/assets/x.png", "assets/x.png"),
        # Percent-encoding: many sound files have spaces in their names, and
        # leaving them encoded drops the entire audio tier from the manifest.
        ("/assets/sounds/ogg/NORMAL%20PAYLINE%201.ogg", "assets/sounds/ogg/NORMAL PAYLINE 1.ogg"),
    ],
)
def test_normalise(url: str, expected: str) -> None:
    assert normalise(url) == expected


def test_g_prefix_is_not_stripped_from_a_real_directory() -> None:
    # `/g7/` is a routing prefix; `/games/` is not, and neither is `/gfx/`.
    assert normalise("/gfx/assets/a.png") == "gfx/assets/a.png"


@pytest.mark.skipif(not REAL_TRACE.is_file(), reason="prototype trace not present")
def test_reproduces_the_hand_derived_slice() -> None:
    """Golden test against the prototype's hand-made _slice.json.

    That file was produced by reading a trace by hand. If this derivation ever
    stops reproducing it, the tiers are wrong and every prefetched load quietly
    degrades to baseline — with no error anywhere.
    """
    tiers = classify(load_traces(REAL_TRACE))
    derived = {path for path, tier in tiers.items() if tier == "slice"}
    expected = {p.split("?")[0] for p in json.loads(KNOWN_SLICE.read_text())}
    assert derived == expected
    assert len(derived) == 27


def test_quorum_excludes_a_file_seen_in_only_one_run() -> None:
    """A file that lands before the Play screen once is a race, not a dependency.

    Paying for it on every device forever is worse than leaving it out.
    """
    early = Trace(splash_ready_ms=100, resources=(("a.png", 10), ("lucky.png", 50)))
    late = Trace(splash_ready_ms=100, resources=(("a.png", 10), ("lucky.png", 900)))
    tiers = classify([early, late, late], quorum=0.5)

    assert tiers["a.png"] == "slice"
    assert tiers["lucky.png"] == "rest"


def test_single_run_still_yields_a_slice() -> None:
    trace = Trace(splash_ready_ms=100, resources=(("a.png", 10), ("b.png", 500)))
    assert classify([trace])["a.png"] == "slice"


def test_non_slice_files_are_tiered_by_kind() -> None:
    trace = Trace(
        splash_ready_ms=10,
        resources=(
            ("assets/images/bigwins.png", 900),
            ("assets/sounds/ogg/win.ogg", 900),
            ("assets/spines/king.png", 900),
        ),
    )
    tiers = classify([trace])
    assert tiers["assets/images/bigwins.png"] == "animation"
    assert tiers["assets/sounds/ogg/win.ogg"] == "audio"
    assert tiers["assets/spines/king.png"] == "rest"


def test_empty_trace_file_is_an_error_not_an_empty_slice() -> None:
    """An empty slice would silently disable prefetching for the whole catalogue."""
    with pytest.raises(ValueError, match="no usable traces"):
        load_traces(Path(__file__).with_name("empty.jsonl"))
