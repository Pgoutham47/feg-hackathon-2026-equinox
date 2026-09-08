"""initial schema

Revision ID: 0001_init
Revises:
"""

import sqlalchemy as sa

from alembic import op

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def upgrade() -> None:
    op.create_table(
        "game",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("tag", sa.String(32)),
        sa.Column("symbol", sa.String(8)),
        sa.Column("gradient", sa.String(64)),
        sa.Column("jackpot", sa.Numeric(12, 2)),
        sa.Column("skin_hue", sa.Float, nullable=False),
        sa.Column("skin_sat", sa.Float, nullable=False),
        sa.Column("skin_val", sa.Float, nullable=False),
        sa.Column("bundle_version", sa.String(40), nullable=False),
        sa.Column("engine_version", sa.String(40), nullable=False),
        sa.Column("popularity_prior", sa.Float, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("skin_hue >= 0 AND skin_hue < 360", name="ck_game_skin_hue_range"),
        sa.CheckConstraint(
            "popularity_prior >= 0 AND popularity_prior <= 1", name="ck_game_prior_range"
        ),
    )
    op.create_index("ix_game_slug", "game", ["slug"], unique=True)
    op.create_index("ix_game_provider", "game", ["provider"])
    op.create_index("ix_game_is_active", "game", ["is_active"])
    op.create_index("ix_game_bundle_version", "game", ["bundle_version"])
    op.create_index("ix_game_active_provider", "game", ["is_active", "provider"])

    op.create_table(
        "bundle_asset",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "game_id",
            sa.Integer,
            sa.ForeignKey("game.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("bundle_version", sa.String(40), nullable=False),
        sa.Column("path", sa.String(512), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("bytes", sa.BigInteger, nullable=False),
        sa.Column("tier", sa.String(16), nullable=False),
        sa.Column("is_skinned", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", TS, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", TS, nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("game_id", "bundle_version", "path", name="uq_bundle_asset_path"),
    )
    op.create_index("ix_bundle_asset_game_id", "bundle_asset", ["game_id"])
    op.create_index("ix_bundle_asset_tier", "bundle_asset", ["tier"])
    op.create_index("ix_bundle_asset_slice", "bundle_asset", ["game_id", "bundle_version", "tier"])

    op.create_table(
        "play_event",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("device_key", sa.String(64), nullable=False),
        sa.Column(
            "game_id", sa.Integer, sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("occurred_at", TS, nullable=False),
    )
    op.create_index("ix_play_event_device_key", "play_event", ["device_key"])
    op.create_index("ix_play_event_occurred_at", "play_event", ["occurred_at"])
    op.create_index("ix_play_event_device_time", "play_event", ["device_key", "occurred_at"])

    op.create_table(
        "load_sample",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("device_key", sa.String(64), nullable=False),
        sa.Column(
            "game_id", sa.Integer, sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("occurred_at", TS, nullable=False),
        sa.Column("time_to_play_screen_ms", sa.Integer, nullable=False),
        sa.Column("cache_hits", sa.Integer, nullable=False, server_default="0"),
        sa.Column("cache_misses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prefetched_bytes", sa.BigInteger, nullable=False, server_default="0"),
        sa.Column("tier", sa.String(16), nullable=False),
        sa.Column("effective_connection_type", sa.String(8)),
    )
    op.create_index("ix_load_sample_device_key", "load_sample", ["device_key"])
    op.create_index("ix_load_sample_occurred_at", "load_sample", ["occurred_at"])
    op.create_index("ix_load_sample_tier", "load_sample", ["tier"])
    op.create_index("ix_load_sample_game_time", "load_sample", ["game_id", "occurred_at"])

    op.create_table(
        "daily_game_stat",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("day", sa.Date, nullable=False),
        sa.Column(
            "game_id", sa.Integer, sa.ForeignKey("game.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("plays", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unique_devices", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prefetch_hits", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prefetch_misses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("p50_ttps_ms", sa.Integer),
        sa.Column("p95_ttps_ms", sa.Integer),
        sa.UniqueConstraint("day", "game_id", name="uq_daily_game_stat_day_game"),
    )
    op.create_index("ix_daily_game_stat_day", "daily_game_stat", ["day"])


def downgrade() -> None:
    for table in ("daily_game_stat", "load_sample", "play_event", "bundle_asset", "game"):
        op.drop_table(table)
