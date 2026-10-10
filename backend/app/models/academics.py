from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TimestampMixin, new_id


class Subject(TimestampMixin, Base):
    __tablename__ = "subjects"
    __table_args__ = (Index("ix_subjects_owner_created", "user_id", "created_at"),)

    subject_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    color: Mapped[str] = mapped_column(String(32), default="sage", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    focus_minutes: Mapped[int] = mapped_column(Integer, default=25, nullable=False)
    break_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)

    user = relationship("User", back_populates="subjects")
    units = relationship("Unit", back_populates="subject", cascade="all, delete-orphan")


class Unit(TimestampMixin, Base):
    __tablename__ = "units"
    __table_args__ = (
        Index("ix_units_owner_subject_order", "user_id", "subject_id", "position"),
    )

    unit_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    subject_id: Mapped[str] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    subject = relationship("Subject", back_populates="units")
    lessons = relationship(
        "Lesson", back_populates="unit", cascade="all, delete-orphan"
    )


class Lesson(TimestampMixin, Base):
    __tablename__ = "lessons"
    __table_args__ = (
        Index("ix_lessons_owner_unit_order", "user_id", "unit_id", "position"),
    )

    lesson_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    subject_id: Mapped[str] = mapped_column(
        ForeignKey("subjects.subject_id"), nullable=False
    )
    unit_id: Mapped[str] = mapped_column(
        ForeignKey("units.unit_id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="not_started", nullable=False
    )
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_studied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    unit = relationship("Unit", back_populates="lessons")


class Notebook(TimestampMixin, Base):
    __tablename__ = "notebooks"
    __table_args__ = (Index("ix_notebooks_owner_updated", "user_id", "updated_at"),)

    notebook_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL"), index=True
    )
    lesson_id: Mapped[str | None] = mapped_column(
        ForeignKey("lessons.lesson_id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    rich_content: Mapped[list[dict] | None] = mapped_column(JSON(none_as_null=True))
    paper_style: Mapped[str] = mapped_column(
        String(16), default="plain", server_default="plain", nullable=False
    )
    font_style: Mapped[str] = mapped_column(
        String(16), default="sans", server_default="sans", nullable=False
    )


class Task(TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (Index("ix_tasks_owner_due", "user_id", "due_date", "completed"),)

    task_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL")
    )
    unit_id: Mapped[str | None] = mapped_column(
        ForeignKey("units.unit_id", ondelete="SET NULL")
    )
    lesson_id: Mapped[str | None] = mapped_column(
        ForeignKey("lessons.lesson_id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(320), nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date)
    due_time: Mapped[str | None] = mapped_column(String(8))
    priority: Mapped[str] = mapped_column(String(16), default="normal", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    reminder_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StudySession(TimestampMixin, Base):
    __tablename__ = "study_sessions"
    __table_args__ = (
        Index("ix_study_sessions_owner_started", "user_id", "started_at"),
        UniqueConstraint("user_id", "request_id", name="uq_study_session_request"),
    )

    session_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL")
    )
    unit_id: Mapped[str | None] = mapped_column(
        ForeignKey("units.unit_id", ondelete="SET NULL")
    )
    lesson_id: Mapped[str | None] = mapped_column(
        ForeignKey("lessons.lesson_id", ondelete="SET NULL")
    )
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    request_id: Mapped[str | None] = mapped_column(String(36))
    circle_event_id: Mapped[str | None] = mapped_column(ForeignKey("circle_study_events.id", ondelete="SET NULL"), index=True)
    mode: Mapped[str] = mapped_column(String(32), default="pomodoro", nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Streak(Base):
    __tablename__ = "streaks"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True
    )
    current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_day: Mapped[date | None] = mapped_column(Date)


class TimetableEntry(TimestampMixin, Base):
    __tablename__ = "timetable_entries"
    __table_args__ = (
        Index("ix_timetable_owner_day_time", "user_id", "day_of_week", "start_time"),
    )

    timetable_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    subject_id: Mapped[str | None] = mapped_column(
        ForeignKey("subjects.subject_id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    scheduled_date: Mapped[date | None] = mapped_column("date", Date)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[str] = mapped_column(String(8), nullable=False)
    end_time: Mapped[str] = mapped_column(String(8), nullable=False)
    kind: Mapped[str] = mapped_column(String(24), default="class", nullable=False)
    recurrence: Mapped[str] = mapped_column(
        String(24), default="weekly", nullable=False
    )
    location: Mapped[str] = mapped_column(String(240), default="", nullable=False)


class Review(TimestampMixin, Base):
    __tablename__ = "reviews"
    __table_args__ = (
        Index("ix_reviews_owner_due", "user_id", "next_review_at"),
        Index("ix_reviews_owner_lesson", "user_id", "lesson_id", unique=True),
    )

    review_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    lesson_id: Mapped[str | None] = mapped_column(
        ForeignKey("lessons.lesson_id", ondelete="SET NULL")
    )
    next_review_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    interval_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    step_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
