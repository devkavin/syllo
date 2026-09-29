"""Align plan helps with monthly referral earning limits.

Revision ID: 20260930_0005
Revises: 20260930_0004
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260930_0005"
down_revision: Union[str, Sequence[str], None] = "20260930_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    plans = (
        ("freshman", 10, '["All study tools", "Study progress"]'),
        ("scholar", 250, '["250 study companion helps", "All study tools"]'),
        ("deans_list", 800, '["800 study companion helps", "All study tools"]'),
    )
    for plan_id, credits, features in plans:
        op.execute(
            sa.text(
                "UPDATE plans SET credits = :credits, features = :features "
                "WHERE plan_id = :plan_id"
            ).bindparams(plan_id=plan_id, credits=credits, features=features)
        )
    # Existing visible balances remain intact; the lower recurring allowance
    # takes effect on each user's next monthly refill.


def downgrade() -> None:
    plans = (
        ("freshman", 40, '["All study tools", "Study progress"]'),
        ("scholar", 300, '["300 study companion helps", "All study tools"]'),
        ("deans_list", 1000, '["1000 study companion helps", "All study tools"]'),
    )
    for plan_id, credits, features in plans:
        op.execute(
            sa.text(
                "UPDATE plans SET credits = :credits, features = :features "
                "WHERE plan_id = :plan_id"
            ).bindparams(plan_id=plan_id, credits=credits, features=features)
        )
