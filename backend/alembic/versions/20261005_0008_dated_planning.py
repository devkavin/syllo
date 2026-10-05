"""Dated plans and timezone names; weekly/legacy content is preserved."""
from alembic import op
import sqlalchemy as sa
revision = "20261005_0008"
down_revision = "20261005_0007"
branch_labels = depends_on = None


def upgrade():
    op.add_column("users", sa.Column("timezone", sa.String(64), nullable=True))
    for column in [sa.Column("date", sa.Date(), nullable=True), sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True), sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True)]: op.add_column("timetable_entries", column)
    op.create_index("ix_timetable_entries_starts_at", "timetable_entries", ["starts_at"])


def downgrade():
    op.drop_index("ix_timetable_entries_starts_at", table_name="timetable_entries")
    for column in ["date", "starts_at", "ends_at"]: op.drop_column("timetable_entries", column)
    op.drop_column("users", "timezone")
