from sqlalchemy import BigInteger, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BundleAsset(Base, TimestampMixin):
    """Every file in a bundle, with the tier that decides whether it is prefetched.

    `tier` is derived by instrumenting a real cold load (see docs/prefetch.md),
    never hand-maintained:
      slice      — the 27 files needed to reach the Play screen (~6.5 MB)
      animation  — big-win art, needed only after a win lands
      audio      — ~27 MB of ogg
      rest       — everything else
    """

    __tablename__ = "bundle_asset"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("game.id", ondelete="CASCADE"), index=True)
    bundle_version: Mapped[str] = mapped_column(String(40))
    path: Mapped[str] = mapped_column(String(512))
    content_hash: Mapped[str] = mapped_column(String(64))
    bytes: Mapped[int] = mapped_column(BigInteger)
    tier: Mapped[str] = mapped_column(String(16), index=True)
    # False when the file comes from the shared engine bundle rather than the
    # per-game skin pack — shared files are fetched once for the whole catalogue.
    is_skinned: Mapped[bool] = mapped_column(default=False)

    __table_args__ = (
        UniqueConstraint("game_id", "bundle_version", "path", name="uq_bundle_asset_path"),
        Index("ix_bundle_asset_slice", "game_id", "bundle_version", "tier"),
    )
