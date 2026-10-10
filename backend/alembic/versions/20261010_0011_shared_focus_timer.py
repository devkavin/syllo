"""Persist shared focus timers and idempotent timer actions."""
from alembic import op
import sqlalchemy as sa

revision = "20261010_0011"
down_revision = "20261010_0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("focus_timers",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("timer", sa.JSON(none_as_null=True)),
        sa.Column("completion", sa.JSON(none_as_null=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table("focus_timer_requests",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True),
        sa.Column("request_id", sa.String(36), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("focus_timer_requests")
    op.drop_table("focus_timers")
