"""Palette rotation.

Ported from prefetch-demo/build_skins.py. Works in 8-bit HSV via PIL, where hue
is 0..255 rather than 0..360: the precision loss is invisible in a reskin and it
is an order of magnitude faster than converting to float.

The rotation preserves the art's *internal* hue relationships — it moves the
whole palette rather than recolouring objects individually — which is why a
30-game catalogue can come from one art set and still read as 30 games. The
inherited limit is that faces recolour along with everything else.
"""

from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

from skin_baker.config import SOURCE_HUE, THUMBNAIL_SIZE


@lru_cache(maxsize=32)
def _gamma_lut(gamma: float) -> bytes:
    ramp = np.clip((np.arange(256) / 255.0) ** gamma * 255.0, 0, 255).astype(np.uint8)
    return ramp.tobytes()


def recolour(image: Image.Image, hue: float, sat: float, val: float) -> Image.Image:
    """Rotate the palette to `hue`, then nudge saturation and value."""
    bands = image.getbands()
    alpha = image.getchannel("A") if "A" in bands else None
    hsv = np.array(image.convert("RGB").convert("HSV"))

    delta_hue = round((hue - SOURCE_HUE) % 360 / 360.0 * 256) % 256
    hsv[..., 0] = (hsv[..., 0].astype(np.int16) + delta_hue) % 256

    # 1.00..1.45 — keep the art rich; a straight rotation reads as washed out.
    saturation_multiplier = 1.00 + 0.45 * sat
    hsv[..., 1] = np.clip(hsv[..., 1].astype(np.float32) * saturation_multiplier, 0, 255).astype(
        np.uint8
    )

    # 1.06..0.90 — darker games get a slight lift, brighter ones a slight cut.
    lut = np.frombuffer(_gamma_lut(round(1.06 - 0.16 * val, 4)), dtype=np.uint8)
    hsv[..., 2] = lut[hsv[..., 2]]

    out = Image.fromarray(hsv, "HSV").convert("RGB")
    if alpha is not None:
        out.putalpha(alpha)
    return out


def save_image(image: Image.Image, path: Path) -> None:
    """Re-encode in the source format. Quality matches the shipped bundle's."""
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()
    if suffix == ".webp":
        image.save(path, "WEBP", quality=86, method=4)
    elif suffix in {".jpg", ".jpeg"}:
        image.convert("RGB").save(path, "JPEG", quality=86, optimize=True, progressive=True)
    else:
        image.save(path, "PNG", optimize=False, compress_level=6)


def make_thumbnail(splash_path: Path, out_path: Path, game_id: int) -> None:
    """Lobby tile art, cut from this game's own recoloured splash.

    Every game shares one background painting, so the framing is varied per game
    as well as the palette — a different zoom and pan each. Without that, 30 tiles
    read as one picture in 30 colours.
    """
    with Image.open(splash_path) as background:
        width, height = background.size
        zoom = 1.00 + 0.55 * ((game_id * 7) % 5) / 4  # 1.00..1.55
        side = int(min(width, height) / zoom)
        pan_x = ((game_id * 13) % 7) / 6.0
        pan_y = ((game_id * 5) % 4) / 3.0
        left = int((width - side) * pan_x)
        top = int((height - side) * pan_y)
        crop = background.crop((left, top, left + side, top + side)).resize(
            (THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.Resampling.LANCZOS
        )
        out_path.parent.mkdir(parents=True, exist_ok=True)
        ImageEnhance.Contrast(crop).enhance(1.12).save(out_path, "WEBP", quality=80, method=4)
