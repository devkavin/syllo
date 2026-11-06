"""Persist bounded, account-owned scientific illustration libraries."""

from alembic import op
import sqlalchemy as sa

revision = "20261027_0014"
down_revision = "20261011_0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "scientific_libraries",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("scientific_libraries")
