from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator


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
    scheduled_date: date | None = Field(default=None, alias="date")
    utc_offset_minutes: int | None = Field(default=None, ge=-840, le=840)
    title: str = Field(min_length=1, max_length=240)
    subject_id: str | None = None
    day_of_week: int = Field(ge=0, le=6)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    location: str = Field(default="", max_length=240)
    kind: str = Field(default="class", pattern="^(class|study|exam|deadline)$")
    recurrence: str = Field(default="weekly", pattern="^(none|weekly)$")

    @field_validator("start_time", "end_time")
    @classmethod
    def valid_clock(cls, value):
        hour, minute = map(int, value.split(":"))
        if hour > 23 or minute > 59: raise ValueError("Enter a valid time")
        return value

    @model_validator(mode="after")
    def valid_block(self):
        if self.end_time <= self.start_time: raise ValueError("End must be after start; split overnight blocks")
        if self.recurrence == "none" and not self.scheduled_date: raise ValueError("One-off plans need a date")
        return self


class TimetablePatch(BaseModel):
    scheduled_date: date | None = Field(default=None, alias="date")
    utc_offset_minutes: int | None = Field(default=None, ge=-840, le=840)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subject_id: str | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    end_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    location: str | None = Field(default=None, max_length=240)
    kind: str | None = Field(default=None, pattern="^(class|study|exam|deadline)$")
    recurrence: str | None = Field(default=None, pattern="^(none|weekly)$")


class StudySessionCreate(BaseModel):
    request_id: UUID | None = None
    circle_event_id: str | None = None
    subject_id: str | None = None
    lesson_id: str | None = None
    duration_seconds: int = Field(ge=0, le=86400)
    mode: str = Field(default="pomodoro", pattern="^(pomodoro|stopwatch|custom)$")
    started_at: datetime
    note: str = ""


class ReviewOutcome(BaseModel):
    quality: str = Field(pattern="^(good|again)$")


class SessionNotePatch(BaseModel):
    note: str = Field(max_length=10000)


class ReviewSchedule(BaseModel):
    next_review_at: AwareDatetime
