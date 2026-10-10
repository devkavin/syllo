"""Owned notebook history, authored practice, and task-based exam revision."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, TimestampMixin, new_id, utc_now


class NotebookVersion(Base):
    __tablename__ = "notebook_versions"
    __table_args__ = (
        UniqueConstraint(
            "notebook_id", "revision", name="uq_notebook_version_revision"
        ),
    )

    version_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    notebook_id: Mapped[str] = mapped_column(
        ForeignKey("notebooks.notebook_id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    rich_content: Mapped[list[dict] | None] = mapped_column(JSON(none_as_null=True))
    paper_style: Mapped[str] = mapped_column(String(16), nullable=False)
    font_style: Mapped[str] = mapped_column(String(16), nullable=False)
    # Historical links are snapshots, not live FKs: deleting a lesson cannot
    # mutate the preserved document. Restore validates them before relinking.
    subject_id: Mapped[str | None] = mapped_column(String(36))
    lesson_id: Mapped[str | None] = mapped_column(String(36))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )


class StudyQuestion(TimestampMixin, Base):
    __tablename__ = "study_questions"
    __table_args__ = (
        Index("ix_study_questions_owner_due", "user_id", "next_review_at"),
    )

    question_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    notebook_id: Mapped[str | None] = mapped_column(
        ForeignKey("notebooks.notebook_id", ondelete="SET NULL")
    )
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL")
    )
    lesson_id: Mapped[str | None] = mapped_column(
        ForeignKey("lessons.lesson_id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, default="", nullable=False)
    mistake: Mapped[str] = mapped_column(Text, default="", nullable=False)
    correction: Mapped[str] = mapped_column(Text, default="", nullable=False)
    confidence: Mapped[str | None] = mapped_column(String(16))
    interval_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_review_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    successes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


class StudyAttempt(Base):
    __tablename__ = "study_attempts"
    __table_args__ = (
        Index("ix_study_attempts_owner_created", "user_id", "created_at"),
    )

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True
    )
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    question_id: Mapped[str | None] = mapped_column(
        ForeignKey("study_questions.question_id", ondelete="SET NULL")
    )
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL")
    )
    lesson_id: Mapped[str | None] = mapped_column(
        ForeignKey("lessons.lesson_id", ondelete="SET NULL")
    )
    topic_title: Mapped[str] = mapped_column(String(240), nullable=False)
    quality: Mapped[str] = mapped_column(String(16), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True).with_variant(DATETIME(fsp=6), "mysql", "mariadb"),
        default=utc_now,
        nullable=False,
    )


class RevisionPlan(TimestampMixin, Base):
    __tablename__ = "revision_plans"
    __table_args__ = (Index("ix_revision_plans_owner_exam", "user_id", "exam_date"),)

    plan_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL")
    )
    exam_date: Mapped[date] = mapped_column(Date, nullable=False)
    daily_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    study_days: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    minutes_per_lesson: Mapped[int] = mapped_column(Integer, nullable=False)


class RevisionPlanItem(Base):
    __tablename__ = "revision_plan_items"

    task_id: Mapped[str] = mapped_column(
        ForeignKey("tasks.task_id", ondelete="CASCADE"), primary_key=True
    )
    plan_id: Mapped[str] = mapped_column(
        ForeignKey("revision_plans.plan_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
