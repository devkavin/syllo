"""Private availability and explicitly accepted Circle study."""
from alembic import op
import sqlalchemy as sa

revision = "20261005_0009"
down_revision = "20261005_0008"
branch_labels = depends_on = None


def upgrade():
    op.add_column("circle_members", sa.Column("share_availability", sa.Boolean(), nullable=False, server_default=sa.false()))
    with op.batch_alter_table("circle_goals") as batch:
        for field, target in (("lesson_id", "lessons.lesson_id"), ("task_id", "tasks.task_id")):
            batch.add_column(sa.Column(field, sa.String(36), nullable=True))
            batch.create_foreign_key(f"fk_circle_goals_{field}", target.split(".")[0], [field], [target.split(".")[1]], ondelete="SET NULL")
    # Freeze migration definitions; later model changes must not change this revision.
    op.create_table("availability_windows", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False), sa.Column("day_of_week", sa.Integer(), nullable=False), sa.Column("start_time", sa.String(5), nullable=False), sa.Column("end_time", sa.String(5), nullable=False))
    op.create_index("ix_availability_windows_user_id", "availability_windows", ["user_id"])
    op.create_table("availability_exclusions", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False), sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_availability_exclusions_user_id", "availability_exclusions", ["user_id"])
    op.create_table("circle_study_events", sa.Column("id", sa.String(36), primary_key=True), sa.Column("circle_id", sa.String(36), sa.ForeignKey("circles.circle_id", ondelete="CASCADE"), nullable=False), sa.Column("organizer_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False), sa.Column("topic", sa.String(160), nullable=False), sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False), sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revision", sa.Integer(), nullable=False), sa.Column("canceled", sa.Boolean(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_circle_events_dates", "circle_study_events", ["circle_id", "starts_at", "ends_at"])
    op.create_table("circle_participations", sa.Column("event_id", sa.String(36), sa.ForeignKey("circle_study_events.id", ondelete="CASCADE"), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True), sa.Column("status", sa.String(16), nullable=False), sa.Column("accepted_revision", sa.Integer(), nullable=True))
    op.create_index("ix_circle_participations_user_id", "circle_participations", ["user_id"])
    with op.batch_alter_table("study_sessions") as batch:
        batch.add_column(sa.Column("circle_event_id", sa.String(36), nullable=True))
        batch.create_foreign_key("fk_study_sessions_circle_event", "circle_study_events", ["circle_event_id"], ["id"], ondelete="SET NULL")
        batch.create_index("ix_study_sessions_circle_event_id", ["circle_event_id"])


def downgrade():
    with op.batch_alter_table("study_sessions") as batch:
        batch.drop_index("ix_study_sessions_circle_event_id")
        batch.drop_constraint("fk_study_sessions_circle_event", type_="foreignkey")
        batch.drop_column("circle_event_id")
    for name in ("circle_participations", "circle_study_events", "availability_exclusions", "availability_windows"):
        op.drop_table(name)
    with op.batch_alter_table("circle_goals") as batch:
        for field in ("task_id", "lesson_id"):
            batch.drop_constraint(f"fk_circle_goals_{field}", type_="foreignkey")
            batch.drop_column(field)
    op.drop_column("circle_members", "share_availability")
