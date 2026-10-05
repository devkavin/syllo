"""Private circles, sandbox billing ledger and complete Companion metering."""
from alembic import op
import sqlalchemy as sa

revision = "20261005_0006"
down_revision = "20260930_0005"
branch_labels = None
depends_on = None


def timestamps():
    return [sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False)]


def user_column(primary=False):
    return sa.Column("user_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=primary, nullable=False)


def upgrade():
    for name in ("thinking_tokens", "cached_input_tokens", "total_tokens"):
        op.add_column("ai_usage_logs", sa.Column(name, sa.Integer(), nullable=False, server_default="0"))
    op.add_column("ai_usage_logs", sa.Column("finish_reason", sa.String(64)))
    op.add_column("ai_usage_logs", sa.Column("plan_id", sa.String(64)))
    op.create_table("circles", sa.Column("circle_id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False), sa.Column("invite_token", sa.String(64), nullable=False, unique=True), *timestamps())
    op.create_index("ix_circles_owner_id", "circles", ["owner_id"])
    op.create_table("circle_members", sa.Column("circle_id", sa.String(36), sa.ForeignKey("circles.circle_id", ondelete="CASCADE"), primary_key=True),
        user_column(True), sa.Column("share_weekly_time", sa.Boolean(), nullable=False), *timestamps())
    op.create_table("circle_goals", sa.Column("goal_id", sa.String(36), primary_key=True),
        sa.Column("circle_id", sa.String(36), sa.ForeignKey("circles.circle_id", ondelete="CASCADE"), nullable=False),
        user_column(), sa.Column("title", sa.String(160), nullable=False), sa.Column("completed", sa.Boolean(), nullable=False), *timestamps())
    op.create_index("ix_circle_goals_circle_id", "circle_goals", ["circle_id"])
    op.create_table("paddle_accounts", user_column(True),
        sa.Column("customer_id", sa.String(64), unique=True), sa.Column("subscription_id", sa.String(64), unique=True),
        sa.Column("plan_id", sa.String(64)), sa.Column("status", sa.String(32), nullable=False),
        sa.Column("paid_through", sa.DateTime(timezone=True)), sa.Column("last_event_at", sa.DateTime(timezone=True)),
        sa.Column("scheduled_change", sa.String(32)), *timestamps())
    op.create_table("paddle_payments", sa.Column("reference", sa.String(36), primary_key=True), user_column(),
        sa.Column("plan_id", sa.String(64), sa.ForeignKey("plans.plan_id"), nullable=False),
        sa.Column("transaction_id", sa.String(64), unique=True), sa.Column("status", sa.String(32), nullable=False),
        sa.Column("last_event_at", sa.DateTime(timezone=True)), *timestamps())
    op.create_index("ix_paddle_payments_user_id", "paddle_payments", ["user_id"])
    op.create_table("paddle_events", sa.Column("event_id", sa.String(64), primary_key=True),
        sa.Column("event_type", sa.String(100), nullable=False), *timestamps())


def downgrade():
    for table in ("paddle_events", "paddle_payments", "paddle_accounts", "circle_goals", "circle_members", "circles"):
        op.drop_table(table)
    for name in ("plan_id", "finish_reason", "total_tokens", "cached_input_tokens", "thinking_tokens"):
        op.drop_column("ai_usage_logs", name)
