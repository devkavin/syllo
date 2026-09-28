"""study companion models, metering, and launch pricing

Revision ID: 20260929_0002
Revises: 20260928_0001
Create Date: 2026-09-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260929_0002"
down_revision: Union[str, Sequence[str], None] = "20260928_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ai_usage_logs", sa.Column("model", sa.String(120)))
    op.add_column(
        "ai_usage_logs",
        sa.Column("input_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "ai_usage_logs",
        sa.Column("output_tokens", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "ai_usage_logs",
        sa.Column(
            "estimated_cost_microusd",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "ai_usage_logs",
        sa.Column("latency_ms", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("ai_usage_logs", sa.Column("error_code", sa.String(64)))
    op.create_index(
        "ix_ai_usage_created_at", "ai_usage_logs", ["created_at"], unique=False
    )

    op.execute(
        sa.text(
            "UPDATE plans SET price_cents = 599, credits = 500, "
            "features = :features WHERE plan_id = 'scholar'"
        ).bindparams(
            features='["500 study companion helps", "All study tools"]'
        )
    )
    op.execute(
        sa.text(
            "UPDATE plans SET price_cents = 1299, credits = 1500, "
            "features = :features WHERE plan_id = 'deans_list'"
        ).bindparams(
            features='["1500 study companion helps", "All study tools"]'
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE plans SET price_cents = 799, credits = 500, "
            "features = :features WHERE plan_id = 'scholar'"
        ).bindparams(
            features='["500 study companion helps", "All study tools"]'
        )
    )
    op.execute(
        sa.text(
            "UPDATE plans SET price_cents = 1499, credits = 3000, "
            "features = :features WHERE plan_id = 'deans_list'"
        ).bindparams(
            features='["3000 study companion helps", "All study tools"]'
        )
    )
    op.drop_index("ix_ai_usage_created_at", table_name="ai_usage_logs")
    op.drop_column("ai_usage_logs", "error_code")
    op.drop_column("ai_usage_logs", "latency_ms")
    op.drop_column("ai_usage_logs", "estimated_cost_microusd")
    op.drop_column("ai_usage_logs", "output_tokens")
    op.drop_column("ai_usage_logs", "input_tokens")
    op.drop_column("ai_usage_logs", "model")
