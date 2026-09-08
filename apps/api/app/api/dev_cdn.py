"""Development-only stand-in for the CDN.

In every real environment the manifest's asset URLs point at object storage
behind a CDN and this service never touches a byte of game content. Locally there
is no CDN, so this router resolves the same URL shape off the filesystem:

    /cdn/{slug}/{bundle_version}/{path}   →  the baked skin pack
    /cdn/_shared/{engine_version}/{path}  →  the shared engine bundle

Resolution order matches what `skin-baker publish --backend local` writes, then
falls back to the unmodified bundle in the repo, so the lobby works before
anything has been baked — with the source art rather than the skinned art.

Mounted only when ENVIRONMENT != production; see create_app().
"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.core.config import Settings, get_settings

router = APIRouter(prefix="/cdn", tags=["dev"], include_in_schema=False)

# apps/api/app/api/dev_cdn.py → repo root
REPO_ROOT = Path(__file__).resolve().parents[4]

# The two things the source-bundle fallback may reach, and nothing else. Every
# response here carries Access-Control-Allow-Origin: *, so a root wide enough to
# include .env would let any page a developer happens to visit read the local
# database URL and the internal API key straight out of the dev server.
SOURCE_ROOT = REPO_ROOT / "assets"
BOOT_FILES = frozenset({"index.html"})  # the bundle's boot document

IMMUTABLE = "public, max-age=31536000, immutable"


def _safe(candidate: Path, root: Path) -> Path | None:
    """The file at `candidate`, but only if it really is a file inside `root`."""
    try:
        resolved = candidate.resolve()
    except OSError:
        return None
    # Path traversal guard: a manifest is trusted, a URL is not.
    if not resolved.is_relative_to(root):
        return None
    return resolved if resolved.is_file() else None


def _resolve(settings: Settings, namespace: str, version: str, asset_path: str) -> Path | None:
    """First hit wins: published objects, then the unmodified source bundle."""
    published_root = Path(settings.dev_cdn_root)
    if not published_root.is_absolute():
        published_root = REPO_ROOT / published_root
    published_root = published_root.resolve()

    published = _safe(published_root / namespace / version / asset_path, published_root)
    if published is not None:
        return published

    # Fallback: the shared bundle. A skinned path that has not been baked yet
    # resolves to the source art, which keeps the lobby working on a fresh clone.
    # Scoped to the bundle itself — assets/ plus its boot document — never the
    # repo, which also holds .env.
    if asset_path in BOOT_FILES:
        boot = REPO_ROOT / asset_path
        return boot if boot.is_file() else None
    return _safe(REPO_ROOT / asset_path, SOURCE_ROOT)


@router.get("/{namespace}/{version}/{asset_path:path}")
async def get_asset(namespace: str, version: str, asset_path: str) -> FileResponse:
    settings = get_settings()
    resolved = _resolve(settings, namespace, version, asset_path)
    if resolved is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No asset {asset_path!r}")

    return FileResponse(
        resolved,
        headers={
            # Same contract as production: the version is in the path, so the
            # bytes at a given URL never change.
            "Cache-Control": IMMUTABLE,
            "Access-Control-Allow-Origin": "*",
        },
    )
