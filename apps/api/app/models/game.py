from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Game(Base, TimestampMixin):
    """One catalogue entry. `skin_*` drives the baked skin pack (tools/skin-baker)."""

    __tablename__ = "game"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    provider: Mapped[str] = mapped_column(String(64), index=True)
    tag: Mapped[str | None] = mapped_column(String(32))
    symbol: Mapped[str | None] = mapped_column(String(8))
    gradient: Mapped[str | None] = mapped_column(String(64))
    jackpot: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    skin_hue: Mapped[float] = mapped_column()
    skin_sat: Mapped[float] = mapped_column()
    skin_val: Mapped[float] = mapped_column()

    # Content hash of the baked pack. Part of every asset URL, so a new version
    # is a new immutable URL and no cache invalidation is ever needed.
    bundle_version: Mapped[str] = mapped_column(String(40), index=True)
    engine_version: Mapped[str] = mapped_column(String(40), index=True)

    # 0..1 cold-start prior used before a device has any play history.
    popularity_prior: Mapped[float] = mapped_column(default=0.0)
    # Whether a baked lobby thumbnail exists at <slug>/<bundle_version>/thumb.webp.
    # Games registered without a bake (e.g. the seed script) have none.
    has_thumbnail: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("skin_hue >= 0 AND skin_hue < 360", name="skin_hue_range"),
        CheckConstraint("popularity_prior >= 0 AND popularity_prior <= 1", name="prior_range"),
        Index("ix_game_active_provider", "is_active", "provider"),
    )
