"""The palette rotation is what makes 30 games out of one art set."""

import numpy as np
import pytest
from PIL import Image

from skin_baker.config import SOURCE_HUE
from skin_baker.recolour import recolour


def _swatch(hue_deg: float = SOURCE_HUE, size: int = 32) -> Image.Image:
    """A flat, fully saturated patch at a known hue."""
    hue = round(hue_deg / 360 * 256) % 256
    hsv = np.zeros((size, size, 3), dtype=np.uint8)
    hsv[..., 0] = hue
    hsv[..., 1] = 200
    hsv[..., 2] = 180
    return Image.fromarray(hsv, "HSV").convert("RGB")


def _median_hue(image: Image.Image) -> int:
    return int(np.median(np.array(image.convert("HSV"))[..., 0]))


@pytest.mark.parametrize("target", [14.0, 120.0, 206.0, 230.0, 314.0])
def test_rotates_the_palette_to_the_target_hue(target: float) -> None:
    out = recolour(_swatch(), hue=target, sat=0.5, val=0.5)
    expected = round(target / 360 * 256) % 256
    # ±2 of 256 — 8-bit HSV round-tripping through RGB is not exact.
    assert abs(_median_hue(out) - expected) <= 2


def test_source_hue_is_a_no_op_rotation() -> None:
    out = recolour(_swatch(), hue=SOURCE_HUE, sat=0.0, val=0.5)
    assert abs(_median_hue(out) - round(SOURCE_HUE / 360 * 256)) <= 2


def test_relative_hues_are_preserved() -> None:
    """The rotation must move the whole palette together.

    Recolouring hues independently would destroy the art's internal
    relationships — shadows and highlights would stop agreeing with each other.
    """
    gap_before = 60.0
    a = recolour(_swatch(SOURCE_HUE), hue=200.0, sat=0.5, val=0.5)
    b = recolour(_swatch(SOURCE_HUE + gap_before), hue=200.0, sat=0.5, val=0.5)
    gap_after = (_median_hue(b) - _median_hue(a)) % 256
    assert abs(gap_after - round(gap_before / 360 * 256)) <= 2


def test_alpha_is_preserved() -> None:
    rgba = _swatch().convert("RGBA")
    rgba.putalpha(Image.new("L", rgba.size, 128))
    out = recolour(rgba, hue=200.0, sat=0.5, val=0.5)
    assert out.mode == "RGBA"
    assert int(np.array(out)[..., 3].mean()) == 128


def test_saturation_gain_follows_the_skin() -> None:
    low = recolour(_swatch(), hue=SOURCE_HUE, sat=0.0, val=0.5)
    high = recolour(_swatch(), hue=SOURCE_HUE, sat=1.0, val=0.5)
    sat_low = np.array(low.convert("HSV"))[..., 1].mean()
    sat_high = np.array(high.convert("HSV"))[..., 1].mean()
    assert sat_high > sat_low
