"""Keep earned Freshman helps separate from the recurring allowance.

Revision ID: 20260929_0003
Revises: 20260929_0002
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260929_0003"
down_revision: Union[str, Sequence[str], None] = "20260929_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("bonus_credits_remaining", sa.Integer(), nullable=False, server_default="0"),
    )
    # Existing balances above the base allowance are clearly earned helps.
    op.execute(
        "UPDATE users SET bonus_credits_remaining = "
        "CASE WHEN ai_credits_remaining > 10 THEN ai_credits_remaining - 10 ELSE 0 END "
        "WHERE plan_id = 'freshman'"
    )


def downgrade() -> None:
    op.drop_column("users", "bonus_credits_remaining")
