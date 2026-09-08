"""Upload the baked catalogue and register it with the API.

Two storage backends:

  local     — copies into a directory. What `make dev` serves, and what the
              tests use; no credentials, no network.
  supabase  — HTTP upload to Supabase Storage.

Both write the same layout, which is the layout the manifest URLs assume:

    <slug>/<bundle_version>/<path>     per-game skin pack
    _shared/<engine_version>/<path>    shared engine, uploaded once

Uploads are skipped when the object already exists: every path contains a
content hash, so a present object is by definition the right bytes. That makes
re-publishing a 30-game catalogue after changing one game cost one game.
"""

import shutil
from abc import ABC, abstractmethod
from dataclasses import asdict
from pathlib import Path

import httpx
import structlog

from skin_baker.bake import BakedGame

log = structlog.get_logger(__name__)

CONTENT_TYPES = {
    ".js": "application/javascript",
    ".json": "application/json",
    ".css": "text/css",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ogg": "audio/ogg",
    ".mp3": "audio/mpeg",
    ".fnt": "text/plain",
    ".atlas": "text/plain",
}
IMMUTABLE = "public, max-age=31536000, immutable"


def content_type(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


class Storage(ABC):
    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def put(self, key: str, source: Path) -> None: ...


class LocalStorage(Storage):
    def __init__(self, root: Path) -> None:
        self._root = root

    def exists(self, key: str) -> bool:
        return (self._root / key).is_file()

    def put(self, key: str, source: Path) -> None:
        target = self._root / key
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


class SupabaseStorage(Storage):
    """Supabase Storage over its S3-compatible object API."""

    def __init__(self, *, url: str, service_role_key: str, bucket: str) -> None:
        self._bucket = bucket
        self._client = httpx.Client(
            base_url=f"{url.rstrip('/')}/storage/v1",
            headers={"authorization": f"Bearer {service_role_key}"},
            timeout=httpx.Timeout(60.0, connect=10.0),
        )

    def exists(self, key: str) -> bool:
        response = self._client.head(f"/object/{self._bucket}/{key}")
        return response.status_code == 200

    def put(self, key: str, source: Path) -> None:
        with source.open("rb") as body:
            response = self._client.post(
                f"/object/{self._bucket}/{key}",
                content=body.read(),
                headers={
                    "content-type": content_type(source),
                    "cache-control": IMMUTABLE,
                    "x-upsert": "true",
                },
            )
        response.raise_for_status()

    def close(self) -> None:
        self._client.close()


def upload_catalogue(
    games: list[BakedGame],
    *,
    storage: Storage,
    source: Path,
    out: Path,
    dry_run: bool,
) -> tuple[int, int]:
    """Returns (uploaded, skipped)."""
    uploaded = skipped = 0
    seen_shared: set[str] = set()

    for game in games:
        if game.has_thumbnail:
            thumb_key = f"{game.slug}/{game.bundle_version}/thumb.webp"
            thumb_local = out / "games" / game.slug / "thumb.webp"
            if thumb_local.is_file():
                if storage.exists(thumb_key):
                    skipped += 1
                else:
                    if not dry_run:
                        storage.put(thumb_key, thumb_local)
                    uploaded += 1

        for asset in game.assets:
            if asset.is_skinned:
                key = f"{game.slug}/{game.bundle_version}/{asset.path}"
                local = out / "games" / game.slug / asset.path
            else:
                key = f"_shared/{game.engine_version}/{asset.path}"
                # The shared half is identical for every game; without this the
                # 27 MB of audio would be considered 30 times.
                if key in seen_shared:
                    continue
                seen_shared.add(key)
                local = source / asset.path

            if not local.is_file():
                log.warning("missing_local_asset", key=key, path=str(local))
                continue
            if storage.exists(key):
                skipped += 1
                continue
            if not dry_run:
                storage.put(key, local)
            uploaded += 1

    return uploaded, skipped


def register(
    games: list[BakedGame], *, api_base_url: str, internal_key: str, dry_run: bool
) -> None:
    """Hand the manifest to the API, which upserts the catalogue and asset table."""
    payload = {"games": [asdict(g) for g in games]}
    if dry_run:
        log.info("register_skipped", reason="dry run", games=len(games))
        return

    response = httpx.post(
        f"{api_base_url.rstrip('/')}/v1/internal/bundles",
        json=payload,
        headers={"x-internal-key": internal_key},
        timeout=httpx.Timeout(120.0, connect=10.0),
    )
    response.raise_for_status()
    log.info("registered", **response.json())
