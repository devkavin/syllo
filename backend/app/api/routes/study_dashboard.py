"""Owned exam summaries and opt-in, timezone-aware in-app reminders."""

from datetime import datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.revision_plans import plan_tasks
from backend.app.api.routes.study_questions import due_counts
from backend.app.database import get_session
from backend.app.models import (
    Lesson,
    RevisionPlan,
    StudyAttempt,
    StudyQuestion,
    StudyReminder,
    Task,
    User,
    base,
)
from backend.app.services.scheduling import (
    accepted_events,
    timetable_intervals,
    user_timezone,
    utc,
)
from backend.app.services.study import lock_student

router = APIRouter(prefix="/study", tags=["study"])
DEFAULT_REMINDERS = {
    "enabled": False,
    "quiet_start": "22:00",
    "quiet_end": "07:00",
    "digest_time": "17:00",
}


class ReminderPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool | None = None
    quiet_start: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    quiet_end: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    digest_time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")

    @field_validator("enabled", "quiet_start", "quiet_end", "digest_time")
    @classmethod
    def valid_value(cls, value, info):
        if value is None:
            raise ValueError("Reminder preferences cannot be null")
        if info.field_name != "enabled":
            hour, minute = map(int, value.split(":"))
            if hour > 23 or minute > 59:
                raise ValueError("Enter a valid time from 00:00 to 23:59")
        return value


def reminder_dict(row):
    return (
        {key: getattr(row, key) for key in DEFAULT_REMINDERS}
        if row
        else dict(DEFAULT_REMINDERS)
    )


def quiet_at(clock, start, end):
    if start < end:
        return start <= clock < end
    return clock >= start or clock < end if start > end else False


@router.get("/reminders")
async def get_reminders(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    return reminder_dict(await session.get(StudyReminder, user.user_id))


@router.patch("/reminders")
async def patch_reminders(
    body: ReminderPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    row = await session.get(StudyReminder, user.user_id)
    if row is None:
        row = StudyReminder(user_id=user.user_id, **DEFAULT_REMINDERS)
        session.add(row)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    await session.commit()
    return reminder_dict(row)


@router.get("/reminders/digest")
async def reminder_digest(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    prefs = reminder_dict(await session.get(StudyReminder, user.user_id))
    now = base.utc_now()
    zone = user_timezone(user)
    local = now.astimezone(zone)
    day = local.date()
    start = datetime.combine(day, time.min, zone).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(
        timezone.utc
    )
    counts = await due_counts(session, user.user_id)
    tasks = (
        await session.scalars(
            select(Task)
            .where(
                Task.user_id == user.user_id,
                Task.completed.is_(False),
                or_(Task.due_date <= day, Task.reminder_at <= now),
            )
            .order_by(Task.due_date, Task.created_at, Task.task_id)
        )
    ).all()
    blocks, _ = await timetable_intervals(session, user, start, end)
    sessions = [
        {
            "title": row.title,
            "starts_at": a.isoformat(),
            "href": f"/timetable?edit={row.timetable_id}",
        }
        for a, _, row in blocks
        if row.kind == "study"
    ]
    sessions.extend(
        {
            "title": event.topic,
            "starts_at": utc(event.starts_at).isoformat(),
            "href": f"/timer?event={event.id}",
        }
        for event, _ in await accepted_events(session, [user.user_id], start, end)
    )
    sessions.sort(key=lambda row: row["starts_at"])
    quiet = quiet_at(local.strftime("%H:%M"), prefs["quiet_start"], prefs["quiet_end"])
    effective_digest_time = (
        prefs["quiet_end"]
        if quiet_at(prefs["digest_time"], prefs["quiet_start"], prefs["quiet_end"])
        else prefs["digest_time"]
    )
    total = counts["due_count"] + len(tasks) + len(sessions)
    return {
        "date": day.isoformat(),
        "timezone": user.timezone or str(zone),
        "quiet": quiet,
        "notification_due": bool(
            prefs["enabled"]
            and not quiet
            and local.strftime("%H:%M") >= effective_digest_time
            and total
        ),
        "practice_due": {
            "questions": counts["questions_count"],
            "mistakes": counts["mistakes_count"],
        },
        "tasks": [
            {
                "task_id": task.task_id,
                "title": task.title,
                "due_date": task.due_date.isoformat() if task.due_date else None,
            }
            for task in tasks
        ],
        "sessions": sessions,
        "total_count": total,
    }


@router.get("/exams")
async def exam_overview(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    plans = (
        await session.scalars(
            select(RevisionPlan)
            .where(RevisionPlan.user_id == user.user_id)
            .order_by(RevisionPlan.exam_date, RevisionPlan.created_at)
        )
    ).all()
    lessons = {
        lesson.lesson_id: lesson
        for lesson in (
            await session.scalars(select(Lesson).where(Lesson.user_id == user.user_id))
        ).all()
    }
    questions = (
        await session.scalars(
            select(StudyQuestion).where(StudyQuestion.user_id == user.user_id)
        )
    ).all()
    attempts = (
        await session.scalars(
            select(StudyAttempt)
            .where(StudyAttempt.user_id == user.user_id)
            .order_by(StudyAttempt.created_at, StudyAttempt.request_id)
        )
    ).all()
    last = {
        attempt.lesson_id: attempt.quality for attempt in attempts if attempt.lesson_id
    }
    now = base.utc_now()
    exams = []
    for plan in plans:
        tasks = await plan_tasks(session, user.user_id, plan.plan_id)
        topics = {}
        for task in tasks:
            if task.lesson_id not in lessons:
                continue
            if task.lesson_id not in topics:
                lesson = lessons[task.lesson_id]
                cards = [q for q in questions if q.lesson_id == lesson.lesson_id]
                topics[lesson.lesson_id] = {
                    "lesson_id": lesson.lesson_id,
                    "title": lesson.title,
                    "status": lesson.status,
                    "scheduled_count": 0,
                    "completed_count": 0,
                    "questions_count": len(cards),
                    "due_count": sum(utc(q.next_review_at) <= now for q in cards),
                    "needs_practice": sum(q.confidence != "good" for q in cards),
                    "last_quality": last.get(lesson.lesson_id),
                }
            topics[task.lesson_id]["scheduled_count"] += 1
            topics[task.lesson_id]["completed_count"] += int(task.completed)
        exams.append(
            {
                "plan_id": plan.plan_id,
                "title": plan.title,
                "subject_id": plan.subject_id,
                "exam_date": plan.exam_date.isoformat(),
                "daily_minutes": plan.daily_minutes,
                "completed_count": sum(task.completed for task in tasks),
                "total_items": len(tasks),
                "topics": list(topics.values()),
            }
        )
    return exams
