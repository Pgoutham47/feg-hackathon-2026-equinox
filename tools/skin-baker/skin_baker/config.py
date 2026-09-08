"""Which files make a game look like a different game.

Ported verbatim from prefetch-demo/build_skins.py. Everything not listed here is
served from the shared engine bundle, which is the whole economics of the
catalogue: 30 games cost one engine plus 30 small art packs, not 30 x 98 MB.
"""

from typing import Final

RESOLUTIONS: Final = ("@0.5x", "@1x")

_IDENTITY_ART: Final = (
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

SKIN_ART: Final[tuple[str, ...]] = (
    *(f"images/{res}/{name}" for res in RESOLUTIONS for name in _IDENTITY_ART),
    *(f"spines/{res}/EOG_Logo_Anim{suffix}.png" for res in RESOLUTIONS for suffix in ("", "_2")),
    "images/loader.webp",
)

# game-empireofgold-*.js carries `gameName`, which drives the document title and
# the in-game UI. It is in the prefetch slice, so skinning it makes each game's
# slice genuinely different rather than 30 copies of the same bytes.
SKIN_TEXT: Final[tuple[str, ...]] = ("game-empireofgold-CK6MbOiD.js",)

# Locale files carrying the game's name, rewritten per game.
LOCALE_FILE: Final = "gameContent.json"

SOURCE_GAME_NAME: Final = "Empire of Gold"

# The gold the shipped bundle is built around, in degrees. Every skin is a
# rotation away from this.
SOURCE_HUE: Final = 40.0

THUMBNAIL_SIZE: Final = 320

# Bumped whenever the bake output changes for the same input, so stamps from an
# older baker are not mistaken for current.
BAKE_FORMAT_VERSION: Final = 6
