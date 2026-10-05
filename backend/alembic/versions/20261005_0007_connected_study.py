"""Stable recording request identifiers; existing sessions remain unchanged."""
from alembic import op
import sqlalchemy as sa

revision = "20261005_0007"
down_revision = "20261005_0006"
branch_labels = depends_on = None


def upgrade():
    with op.batch_alter_table("study_sessions") as batch:
        batch.add_column(sa.Column("request_id", sa.String(36), nullable=True))
        batch.create_unique_constraint("uq_study_session_request", ["user_id", "request_id"])


def downgrade():
    with op.batch_alter_table("study_sessions") as batch:
        batch.drop_constraint("uq_study_session_request", type_="unique")
        batch.drop_column("request_id")
