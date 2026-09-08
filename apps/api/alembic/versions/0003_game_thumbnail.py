"""game.has_thumbnail

Set by tools/skin-baker at registration. Nullable-then-default rather than a
plain NOT NULL add, so the migration is safe to run before the code that writes
it is deployed.

Revision ID: 0003_thumbnail
Revises: 0002_ranking
"""

import sqlalchemy as sa

from alembic import op

revision = "0003_thumbnail"
down_revision = "0002_ranking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game",
        sa.Column("has_thumbnail", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )


def downgrade() -> None:
    op.drop_column("game", "has_thumbnail")
