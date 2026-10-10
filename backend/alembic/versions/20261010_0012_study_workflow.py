"""Add recoverable notebooks, authored practice, and revision plan task links."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.mysql import DATETIME

revision = "20261010_0012"
down_revision = "20261010_0011"
branch_labels = depends_on = None


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade():
    op.add_column(
        "notebooks",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("notebooks", sa.Column("deleted_at", sa.DateTime(timezone=True)))
    op.create_table(
        "notebook_versions",
        sa.Column("version_id", sa.String(36), primary_key=True),
        sa.Column(
            "notebook_id",
            sa.String(36),
            sa.ForeignKey("notebooks.notebook_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("rich_content", sa.JSON(none_as_null=True)),
        sa.Column("paper_style", sa.String(16), nullable=False),
        sa.Column("font_style", sa.String(16), nullable=False),
        sa.Column("subject_id", sa.String(36)),
        sa.Column("lesson_id", sa.String(36)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "notebook_id", "revision", name="uq_notebook_version_revision"
        ),
    )
    op.create_table(
        "study_questions",
        sa.Column("question_id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "notebook_id",
            sa.String(36),
            sa.ForeignKey("notebooks.notebook_id", ondelete="SET NULL"),
        ),
        sa.Column(
            "subject_id",
            sa.String(36),
            sa.ForeignKey("subjects.subject_id", ondelete="SET NULL"),
        ),
        sa.Column(
            "lesson_id",
            sa.String(36),
            sa.ForeignKey("lessons.lesson_id", ondelete="SET NULL"),
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("mistake", sa.Text(), nullable=False),
        sa.Column("correction", sa.Text(), nullable=False),
        sa.Column("confidence", sa.String(16)),
        sa.Column("interval_days", sa.Integer(), nullable=False),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("successes", sa.Integer(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        *timestamps(),
    )
    op.create_index(
        "ix_study_questions_owner_due", "study_questions", ["user_id", "next_review_at"]
    )
    op.create_table(
        "study_attempts",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("request_id", sa.String(36), primary_key=True),
        sa.Column(
            "question_id",
            sa.String(36),
            sa.ForeignKey("study_questions.question_id", ondelete="SET NULL"),
        ),
        sa.Column(
            "subject_id",
            sa.String(36),
            sa.ForeignKey("subjects.subject_id", ondelete="SET NULL"),
        ),
        sa.Column(
            "lesson_id",
            sa.String(36),
            sa.ForeignKey("lessons.lesson_id", ondelete="SET NULL"),
        ),
        sa.Column("topic_title", sa.String(240), nullable=False),
        sa.Column("quality", sa.String(16), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True).with_variant(
                DATETIME(fsp=6), "mysql", "mariadb"
            ),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_study_attempts_owner_created", "study_attempts", ["user_id", "created_at"]
    )
    op.create_table(
        "revision_plans",
        sa.Column("plan_id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column(
            "subject_id",
            sa.String(36),
            sa.ForeignKey("subjects.subject_id", ondelete="SET NULL"),
        ),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("daily_minutes", sa.Integer(), nullable=False),
        sa.Column("study_days", sa.JSON(), nullable=False),
        sa.Column("minutes_per_lesson", sa.Integer(), nullable=False),
        *timestamps(),
    )
    op.create_index(
        "ix_revision_plans_owner_exam", "revision_plans", ["user_id", "exam_date"]
    )
    op.create_table(
        "revision_plan_items",
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.task_id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "plan_id",
            sa.String(36),
            sa.ForeignKey("revision_plans.plan_id", ondelete="CASCADE"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_revision_plan_items_plan_id", "revision_plan_items", ["plan_id"]
    )


def downgrade():
    op.drop_table("revision_plan_items")
    op.drop_table("revision_plans")
    op.drop_table("study_attempts")
    op.drop_table("study_questions")
    op.drop_table("notebook_versions")
    with op.batch_alter_table("notebooks") as batch:
        batch.drop_column("deleted_at")
        batch.drop_column("revision")
