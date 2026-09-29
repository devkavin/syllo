"""Set launch plan allowances and preview prices.

Revision ID: 20260930_0004
Revises: 20260929_0003
"""

from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260930_0004"
down_revision: Union[str, Sequence[str], None] = "20260929_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    plans = (
        ("freshman", 0, 40, '["All study tools", "Study progress"]'),
        ("scholar", 899, 300, '["300 study companion helps", "All study tools"]'),
        ("deans_list", 1399, 1000, '["1000 study companion helps", "All study tools"]'),
    )
    for plan_id, price_cents, credits, features in plans:
        op.execute(
            sa.text(
                "UPDATE plans SET price_cents = :price_cents, credits = :credits, "
                "features = :features WHERE plan_id = :plan_id"
            ).bindparams(
                plan_id=plan_id,
                price_cents=price_cents,
                credits=credits,
                features=features,
            )
        )

    # Give existing Freshman accounts the 30 additional recurring helps this cycle.
    # Accounts from older cycles receive the new 40-help refill when they return.
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    op.execute(
        sa.text(
            "UPDATE users SET ai_credits_remaining = "
            "CASE WHEN ai_credits_remaining + 30 > 100 THEN 100 "
            "ELSE ai_credits_remaining + 30 END "
            "WHERE plan_id = 'freshman' AND credit_period = :period"
        ).bindparams(period=period)
    )


def downgrade() -> None:
    # Do not revoke helps already awarded to students.
    plans = (
        ("freshman", 0, 10, '["All study tools", "Study progress"]'),
        ("scholar", 599, 500, '["500 study companion helps", "All study tools"]'),
        ("deans_list", 1299, 1500, '["1500 study companion helps", "All study tools"]'),
    )
    for plan_id, price_cents, credits, features in plans:
        op.execute(
            sa.text(
                "UPDATE plans SET price_cents = :price_cents, credits = :credits, "
                "features = :features WHERE plan_id = :plan_id"
            ).bindparams(
                plan_id=plan_id,
                price_cents=price_cents,
                credits=credits,
                features=features,
            )
        )
