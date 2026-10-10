from __future__ import annotations

from datetime import date, datetime
import json
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, Field, field_validator, model_validator


# Match the pinned BlockNote 0.55 defaults and notebook academic extensions.
NOTEBOOK_BLOCK_TYPES = frozenset({
    "audio", "bulletListItem", "checkListItem", "codeBlock", "divider", "file",
    "heading", "image", "numberedListItem", "paragraph", "quote", "table",
    "toggleListItem", "video", "mathBlock", "diagram", "callout",
})
NOTEBOOK_INLINE_TYPES = frozenset({"text", "link", "math"})
NOTEBOOK_STYLE_TYPES = frozenset({
    "bold", "italic", "underline", "strike", "code", "textColor", "backgroundColor",
    "superscript", "subscript",
})
NOTEBOOK_CALLOUT_KINDS = frozenset({"note", "definition", "formula", "example", "warning"})


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


class NotebookDocument(BaseModel):
    rich_content: list[dict] | None = None

    @field_validator("rich_content")
    @classmethod
    def validate_document(cls, value: list[dict] | None) -> list[dict] | None:
        if value is None:
            return value
        if not value or len(json.dumps(value, allow_nan=False).encode("utf-8")) > 2_000_000:
            raise ValueError("Notebook document must contain blocks and be under 2 MB")
        pending = [(block, 0) for block in value]
        count = 0
        while pending:
            block, depth = pending.pop()
            count += 1
            if count > 10_000 or depth > 64:
                raise ValueError("Notebook document is too complex")
            if not isinstance(block, dict) or not isinstance(block.get("type"), str) or not block["type"].strip():
                raise ValueError("Notebook blocks require a type")
            if block["type"] not in NOTEBOOK_BLOCK_TYPES:
                raise ValueError("Notebook block type is not supported")
            if "id" in block and (not isinstance(block["id"], str) or not block["id"]):
                raise ValueError("Block ids must be nonempty strings")
            if "props" in block and not isinstance(block["props"], dict):
                raise ValueError("Block props must be an object")
            children = block.get("children", [])
            if not isinstance(children, list):
                raise ValueError("Block children must be a list")
            pending.extend((child, depth + 1) for child in children)
            content = block.get("content")
            if block["type"] in {"mathBlock", "diagram"}:
                cls.validate_source_content(content)
                continue
            if block["type"] == "callout":
                kind = block.get("props", {}).get("kind")
                if not isinstance(kind, str) or kind not in NOTEBOOK_CALLOUT_KINDS:
                    raise ValueError("Callout kind is not supported")
                if not isinstance(content, list):
                    raise ValueError("Callouts require inline content")
            if content is None:
                continue
            if isinstance(content, list):
                cls.validate_inline_content(content)
            elif isinstance(content, dict):
                if content.get("type") != "tableContent" or not isinstance(content.get("rows"), list):
                    raise ValueError("Structured content must be a table")
                if any(not isinstance(row, dict) or not isinstance(row.get("cells"), list) for row in content["rows"]):
                    raise ValueError("Table rows require cells")
                for row in content["rows"]:
                    for cell in row["cells"]:
                        if isinstance(cell, dict) and cell.get("type") == "tableCell":
                            cell = cell.get("content")
                        cls.validate_inline_content(cell)
            else:
                raise ValueError("Block content must be inline content or a table")
        return value

    @staticmethod
    def validate_source_content(content: str | list) -> None:
        if isinstance(content, str):
            return
        if not isinstance(content, list):
            raise ValueError("Math and diagram content requires source text")
        for item in content:
            if (
                not isinstance(item, dict)
                or item.get("type") != "text"
                or not isinstance(item.get("text"), str)
                or item.get("styles", {}) != {}
            ):
                raise ValueError("Math and diagram source requires unstyled text items")

    @staticmethod
    def validate_inline_content(content: list) -> None:
        if not isinstance(content, list):
            raise ValueError("Inline content must be a list")
        pending = [(item, 0) for item in content]
        while pending:
            item, depth = pending.pop()
            if depth > 64 or not isinstance(item, dict) or not isinstance(item.get("type"), str):
                raise ValueError("Inline content must contain typed objects")
            if item["type"] not in NOTEBOOK_INLINE_TYPES:
                raise ValueError("Notebook inline content type is not supported")
            if item["type"] == "text":
                if not isinstance(item.get("text"), str) or not isinstance(item.get("styles", {}), dict):
                    raise ValueError("Text requires a string and an object of styles")
                if item.get("styles", {}).keys() - NOTEBOOK_STYLE_TYPES:
                    raise ValueError("Notebook text style is not supported")
                for style, enabled in item.get("styles", {}).items():
                    if style in {"superscript", "subscript"} and not isinstance(enabled, bool):
                        raise ValueError("Superscript and subscript styles require booleans")
            elif item["type"] == "link":
                if not isinstance(item.get("href"), str) or not isinstance(item.get("content"), list):
                    raise ValueError("Links require a URL string and inline content")
                pending.extend((child, depth + 1) for child in item["content"])
            elif item["type"] == "math":
                NotebookDocument.validate_source_content(item.get("content"))


class NotebookCreate(NotebookDocument):
    title: str = Field(min_length=1, max_length=240)
    subject_id: str | None = None
    lesson_id: str | None = None
    content: str = ""
    paper_style: Literal["plain", "ruled", "dotted"] = "plain"
    font_style: Literal["sans", "serif", "mono"] = "sans"


class NotebookPatch(NotebookDocument):
    expected_revision: int | None = Field(default=None, ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=240)
    subject_id: str | None = None
    lesson_id: str | None = None
    content: str | None = None
    paper_style: Literal["plain", "ruled", "dotted"] | None = None
    font_style: Literal["sans", "serif", "mono"] | None = None

    @field_validator("paper_style", "font_style")
    @classmethod
    def nonnull_preference(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Notebook preferences cannot be null")
        return value


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
