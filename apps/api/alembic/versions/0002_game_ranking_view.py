"""game_ranking materialized view

The popularity prior the policy reads. A materialized view refreshed on a cron
is what replaces a Redis sorted set here: one cheap indexed read per request,
no second datastore, and the ranking survives a restart.

Revision ID: 0002_ranking
Revises: 0001_init
"""

from alembic import op

revision = "0002_ranking"
down_revision = "0001_init"
branch_labels = None
depends_on = None

VIEW = """
CREATE MATERIALIZED VIEW game_ranking AS
SELECT
    g.id   AS game_id,
    g.slug AS slug,
    -- Recency-weighted global plays over 30 days, normalised to 0..1, blended
    -- with the editorial prior so a brand-new game is still prefetchable.
    GREATEST(
        g.popularity_prior,
        COALESCE(
            SUM(exp(-EXTRACT(EPOCH FROM (now() - e.occurred_at)) / 604800.0))
              OVER (PARTITION BY g.id)
            / NULLIF(MAX(SUM(exp(-EXTRACT(EPOCH FROM (now() - e.occurred_at)) / 604800.0)))
              OVER (), 0),
            0
        )
    )::float8 AS prior
FROM game g
LEFT JOIN play_event e
       ON e.game_id = g.id AND e.occurred_at >= now() - interval '30 days'
WHERE g.is_active
GROUP BY g.id, g.slug, g.popularity_prior, e.occurred_at
"""


def upgrade() -> None:
    op.execute(VIEW)
    # Unique index is required for REFRESH ... CONCURRENTLY.
    op.execute("CREATE UNIQUE INDEX uq_game_ranking_game_id ON game_ranking (game_id)")
    op.execute("CREATE INDEX ix_game_ranking_slug ON game_ranking (slug)")


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS game_ranking")
