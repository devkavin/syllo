from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    color: str = Field(default="sage", max_length=32)
    description: str = ""
    focus_minutes: int = Field(default=25, ge=1, le=240)
    break_minutes: int = Field(default=5, ge=1, le=120)


class SubjectPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    color: str | None = Field(default=None, max_length=32)
    description: str | None = None
    focus_minutes: int | None = Field(default=None, ge=1, le=240)
    break_minutes: int | None = Field(default=None, ge=1, le=120)


class UnitCreate(BaseModel):
    subject_id: str
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    order: int = 0


class UnitPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    order: int | None = None


class LessonCreate(BaseModel):
    unit_id: str
    title: str = Field(min_length=1, max_length=240)
    notes: str = ""
    order: int = 0


class LessonPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    notes: str | None = None
    status: str | None = Field(
        default=None,
        pattern="^(not_started|in_progress|learning|reviewed|done|completed)$",
    )
    order: int | None = None


class NotebookCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    subject_id: str | None = None
    lesson_id: str | None = None
    content: str = ""


class NotebookPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subject_id: str | None = None
    lesson_id: str | None = None
    content: str | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=320)
    subject_id: str | None = None
    unit_id: str | None = None
    lesson_id: str | None = None
    due_date: date | None = None
    due_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    priority: str = Field(default="normal", pattern="^(low|normal|high)$")
    reminder_at: datetime | None = None
    notes: str = ""


class TaskPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=320)
    subject_id: str | None = None
    unit_id: str | None = None
    lesson_id: str | None = None
    due_date: date | None = None
    due_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    priority: str | None = Field(default=None, pattern="^(low|normal|high)$")
    reminder_at: datetime | None = None
    notes: str | None = None
    completed: bool | None = None


class TimetableCreate(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    subject_id: str | None = None
    day_of_week: int = Field(ge=0, le=6)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    location: str = Field(default="", max_length=240)
    kind: str = Field(default="class", pattern="^(class|study|exam|deadline)$")
    recurrence: str = Field(default="weekly", pattern="^(none|weekly)$")


class TimetablePatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subject_id: str | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    location: str | None = Field(default=None, max_length=240)
    kind: str | None = Field(default=None, pattern="^(class|study|exam|deadline)$")
    recurrence: str | None = Field(default=None, pattern="^(none|weekly)$")


class StudySessionCreate(BaseModel):
    subject_id: str | None = None
    lesson_id: str | None = None
    duration_seconds: int = Field(ge=0, le=86400)
    mode: str = Field(default="pomodoro", pattern="^(pomodoro|stopwatch|custom)$")
    started_at: datetime
    note: str = ""


class ReviewOutcome(BaseModel):
    quality: str = Field(pattern="^(good|again)$")
