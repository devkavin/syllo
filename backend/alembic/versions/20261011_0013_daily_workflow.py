"""Add authored formats, self-marked attempts, plan durations and reminder preferences."""

from alembic import op
import sqlalchemy as sa

revision = "20261011_0013"
down_revision = "20261010_0012"
branch_labels = depends_on = None


def upgrade():
    op.add_column(
        "study_questions",
        sa.Column("format", sa.String(16), nullable=False, server_default="basic"),
    )
    op.add_column("study_questions", sa.Column("time_limit_seconds", sa.Integer()))
    op.add_column("study_questions", sa.Column("max_marks", sa.Integer()))
    for field in ("elapsed_seconds", "earned_marks", "max_marks"):
        op.add_column("study_attempts", sa.Column(field, sa.Integer()))
    op.add_column(
        "revision_plans",
        sa.Column("repeat_difficult", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "revision_plan_items",
        sa.Column("minutes", sa.Integer(), nullable=False, server_default="30"),
    )
    # Correlated to the other table, so this works on SQLite and MySQL without
    # reading/writing a target table subquery or parsing students' task notes.
    op.execute(
        sa.text(
            "UPDATE revision_plan_items SET minutes = (SELECT minutes_per_lesson FROM revision_plans WHERE revision_plans.plan_id = revision_plan_items.plan_id)"
        )
    )
    op.create_table(
        "study_reminders",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("quiet_start", sa.String(5), nullable=False, server_default="22:00"),
        sa.Column("quiet_end", sa.String(5), nullable=False, server_default="07:00"),
        sa.Column("digest_time", sa.String(5), nullable=False, server_default="17:00"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("study_reminders")
    with op.batch_alter_table("revision_plan_items") as batch:
        batch.drop_column("minutes")
    with op.batch_alter_table("revision_plans") as batch:
        batch.drop_column("repeat_difficult")
    with op.batch_alter_table("study_attempts") as batch:
        for field in ("max_marks", "earned_marks", "elapsed_seconds"):
            batch.drop_column(field)
    with op.batch_alter_table("study_questions") as batch:
        for field in ("max_marks", "time_limit_seconds", "format"):
            batch.drop_column(field)
