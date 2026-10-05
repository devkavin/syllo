from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject
from backend.app.api.routes.planner import timetable_dict
from backend.app.api.routes.tasks import task_dict
from backend.app.database import get_session
from backend.app.models import (
    Lesson,
    Review,
    Streak,
    StudySession,
    Subject,
    Task,
    TimetableEntry,
    User,
)
from backend.app.schemas.academics import ReviewOutcome, StudySessionCreate, SessionNotePatch, ReviewSchedule
from backend.app.services.study import ensure_review, lock_student, schedule_review
from backend.app.services.scheduling import build_agenda, user_timezone

router = APIRouter(tags=["study"])
REVIEW_STEPS = (1, 3, 7, 14, 30, 60, 120)


def utc_value(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def session_dict(item: StudySession) -> dict:
    return {
        "session_id": item.session_id,
        "request_id": item.request_id,
        "circle_event_id": item.circle_event_id,
        "subject_id": item.subject_id,
        "unit_id": item.unit_id,
        "lesson_id": item.lesson_id,
        "duration_seconds": item.duration_seconds,
        "mode": item.mode,
        "started_at": utc_value(item.started_at).isoformat(),
        "finished_at": (
            utc_value(item.finished_at).isoformat() if item.finished_at else None
        ),
        "note": item.note,
        "created_at": utc_value(item.created_at).isoformat(),
    }


def review_state(review: Review, local_day_start_utc: datetime | None = None) -> str:
    now = datetime.now(timezone.utc)
    due_at = utc_value(review.next_review_at)
    if local_day_start_utc and due_at < local_day_start_utc:
        return "missed"
    if due_at <= now:
        return "due"
    return "upcoming"


def review_dict(review: Review, lesson: Lesson | None = None, day_start=None) -> dict:
    return {
        "review_id": review.review_id,
        "lesson_id": review.lesson_id,
        "lesson_title": lesson.title if lesson else "Lesson",
        "subject_id": lesson.subject_id if lesson else None,
        "next_review_at": utc_value(review.next_review_at).isoformat(),
        "interval_days": review.interval_days,
        "step_index": review.step_index,
        "completed_at": (
            utc_value(review.completed_at).isoformat() if review.completed_at else None
        ),
        "state": review_state(review, day_start),
    }


async def record_study_session(
    session: AsyncSession,
    user: User,
    body: StudySessionCreate,
) -> StudySession:
    await lock_student(session, user.user_id)
    if body.request_id:
        previous = await session.scalar(select(StudySession).where(StudySession.user_id == user.user_id, StudySession.request_id == str(body.request_id)).with_for_update().execution_options(populate_existing=True))
        if previous:
            if (previous.circle_event_id != body.circle_event_id or previous.lesson_id != body.lesson_id or previous.duration_seconds != body.duration_seconds or previous.mode != body.mode or utc_value(previous.started_at).replace(microsecond=0) != utc_value(body.started_at).replace(microsecond=0) or (body.subject_id and previous.subject_id != body.subject_id)):
                raise HTTPException(409, "This recording request already saved a different session")
            return previous
    if body.circle_event_id:
        from backend.app.services.circle_scheduling import validate_recorded_event
        await validate_recorded_event(session, user, body.circle_event_id)
    lesson = (
        await owned_lesson(session, user.user_id, body.lesson_id)
        if body.lesson_id
        else None
    )
    if body.subject_id:
        await owned_subject(session, user.user_id, body.subject_id)
    if lesson and body.subject_id and lesson.subject_id != body.subject_id:
        raise HTTPException(status_code=400, detail="Lesson does not belong to subject")
    if lesson:
        lesson = await session.scalar(select(Lesson).where(Lesson.lesson_id == lesson.lesson_id).with_for_update().execution_options(populate_existing=True))

    # Match the existing MySQL DATETIME(0) precision before persisting/retrying.
    started_at = utc_value(body.started_at).replace(microsecond=0)
    item = StudySession(
        request_id=str(body.request_id) if body.request_id else None,
        circle_event_id=body.circle_event_id,
        user_id=user.user_id,
        subject_id=lesson.subject_id if lesson else body.subject_id,
        unit_id=lesson.unit_id if lesson else None,
        lesson_id=lesson.lesson_id if lesson else None,
        duration_seconds=body.duration_seconds,
        mode=body.mode,
        started_at=started_at,
        finished_at=started_at + timedelta(seconds=body.duration_seconds),
        note=body.note,
    )
    session.add(item)

    if lesson:
        lesson.total_seconds += body.duration_seconds
        lesson.last_studied_at = datetime.now(timezone.utc)
        if lesson.status == "not_started":
            lesson.status = "in_progress"
        await ensure_review(session, lesson)

    local_day = started_at.astimezone(user_timezone(user)).date()
    streak = await session.get(Streak, user.user_id, with_for_update=True)
    if streak is None:
        streak = Streak(user_id=user.user_id, current=1, longest=1, last_day=local_day)
        session.add(streak)
    elif streak.last_day != local_day:
        streak.current = (
            streak.current + 1
            if streak.last_day == local_day - timedelta(days=1)
            else 1
        )
        streak.longest = max(streak.longest, streak.current)
        streak.last_day = local_day

    await session.commit()
    await session.refresh(item)
    return item


@router.get("/sessions")
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=500),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    items = (
        await session.scalars(
            select(StudySession)
            .where(StudySession.user_id == user.user_id)
            .order_by(StudySession.started_at.desc())
            .limit(limit)
        )
    ).all()
    return [session_dict(item) for item in items]


@router.post("/sessions")
async def create_session(
    body: StudySessionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return session_dict(await record_study_session(session, user, body))


@router.get("/reviews")
async def list_reviews(
    due_only: bool = False,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    statement = select(Review).where(Review.user_id == user.user_id)
    if due_only:
        statement = statement.where(Review.next_review_at <= datetime.now(timezone.utc))
    reviews = (await session.scalars(statement.order_by(Review.next_review_at))).all()
    lesson_ids = [review.lesson_id for review in reviews if review.lesson_id]
    lessons = (
        (
            await session.scalars(
                select(Lesson).where(
                    Lesson.user_id == user.user_id, Lesson.lesson_id.in_(lesson_ids)
                )
            )
        ).all()
        if lesson_ids
        else []
    )
    lesson_map = {lesson.lesson_id: lesson for lesson in lessons}
    return [review_dict(review, lesson_map.get(review.lesson_id)) for review in reviews]


@router.patch("/sessions/{session_id}")
async def update_session_note(session_id: str, body: SessionNotePatch, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    item = await session.scalar(select(StudySession).where(StudySession.session_id == session_id, StudySession.user_id == user.user_id).with_for_update())
    if item is None:
        raise HTTPException(404, "Session not found")
    item.note = body.note
    await session.commit()
    return session_dict(item)


@router.put("/lessons/{lesson_id}/review")
async def set_review(lesson_id: str, body: ReviewSchedule, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    review, lesson = await schedule_review(session, user, lesson_id, body.next_review_at)
    return review_dict(review, lesson)


@router.post("/reviews/{review_id}/mark")
async def mark_review(
    review_id: str,
    body: ReviewOutcome,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    review = await session.scalar(
        select(Review).where(
            Review.review_id == review_id, Review.user_id == user.user_id
        )
    )
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    review.step_index = (
        0
        if body.quality == "again"
        else min(review.step_index + 1, len(REVIEW_STEPS) - 1)
    )
    review.interval_days = REVIEW_STEPS[review.step_index]
    review.completed_at = datetime.now(timezone.utc)
    review.next_review_at = review.completed_at + timedelta(days=review.interval_days)
    await session.commit()
    await session.refresh(review)
    lesson = (
        await owned_lesson(session, user.user_id, review.lesson_id)
        if review.lesson_id
        else None
    )
    return review_dict(review, lesson)


@router.get("/today")
async def today(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    now = datetime.now(timezone.utc)
    local_now = now.astimezone(user_timezone(user))
    local_day = local_now.date()
    day_start = datetime.combine(local_day, datetime.min.time(), user_timezone(user)).astimezone(timezone.utc)
    day_end = datetime.combine(local_day + timedelta(days=1), datetime.min.time(), user_timezone(user)).astimezone(timezone.utc)

    tasks = (
        await session.scalars(
            select(Task)
            .where(
                Task.user_id == user.user_id,
                Task.completed.is_(False),
                Task.due_date.is_not(None),
                Task.due_date <= local_day,
            )
            .order_by(Task.due_date, Task.due_time)
            .limit(20)
        )
    ).all()
    sessions = (
        await session.scalars(
            select(StudySession)
            .where(
                StudySession.user_id == user.user_id,
                StudySession.started_at >= day_start,
                StudySession.started_at < day_end,
            )
            .order_by(StudySession.started_at.desc())
        )
    ).all()
    seconds_today = await session.scalar(
        select(func.coalesce(func.sum(StudySession.duration_seconds), 0)).where(
            StudySession.user_id == user.user_id,
            StudySession.started_at >= day_start,
            StudySession.started_at < day_end,
        )
    )
    timetable = (
        await session.scalars(
            select(TimetableEntry)
            .where(
                TimetableEntry.user_id == user.user_id,
                or_(
                    and_(TimetableEntry.recurrence == "weekly", TimetableEntry.day_of_week == local_day.weekday()),
                    and_(TimetableEntry.recurrence == "none", TimetableEntry.starts_at < day_end, TimetableEntry.ends_at > day_start),
                ),
            )
            .order_by(TimetableEntry.start_time)
        )
    ).all()
    reviews = (
        await session.scalars(
            select(Review)
            .where(Review.user_id == user.user_id, Review.next_review_at < day_end)
            .order_by(Review.next_review_at)
        )
    ).all()
    lesson_ids = [review.lesson_id for review in reviews if review.lesson_id]
    lessons = (
        (
            await session.scalars(
                select(Lesson).where(
                    Lesson.user_id == user.user_id, Lesson.lesson_id.in_(lesson_ids)
                )
            )
        ).all()
        if lesson_ids
        else []
    )
    lesson_map = {lesson.lesson_id: lesson for lesson in lessons}
    streak = await session.get(Streak, user.user_id)
    subjects_count = await session.scalar(
        select(func.count()).select_from(Subject).where(Subject.user_id == user.user_id)
    )
    day_agenda = await build_agenda(session, user, day_start, day_end)
    future_agenda = await build_agenda(session, user, day_end, day_end + timedelta(days=7))
    from backend.app.models import CircleStudyEvent, CircleParticipation, CircleMember
    from backend.app.services.circle_scheduling import event_view
    invitations = (await session.scalars(select(CircleStudyEvent).join(CircleParticipation).join(CircleMember, (CircleMember.circle_id == CircleStudyEvent.circle_id) & (CircleMember.user_id == CircleParticipation.user_id)).where(CircleParticipation.user_id == user.user_id, CircleParticipation.status == "invited", CircleStudyEvent.canceled.is_(False), CircleStudyEvent.ends_at > now).order_by(CircleStudyEvent.starts_at).limit(20))).all()
    return {
        "today": local_day.isoformat(),
        "circle_invitations": [await event_view(session, e, user.user_id) for e in invitations],
        "seconds_today": int(seconds_today or 0),
        "tasks": [task_dict(task) for task in tasks],
        "sessions": [session_dict(item) for item in sessions],
        "streak": {
            "current": streak.current if streak else 0,
            "longest": streak.longest if streak else 0,
            "last_day": (
                streak.last_day.isoformat() if streak and streak.last_day else None
            ),
        },
        "subjects_count": int(subjects_count or 0),
        "timetable": [timetable_dict(item, user) for item in timetable],
        "agenda": day_agenda["items"],
        "schedule_warnings": day_agenda["warnings"],
        "upcoming_deadlines": [i for i in future_agenda["items"] if i["kind"] in {"task", "exam", "deadline"}][:5],
        "reviews_due": [
            review_dict(review, lesson_map.get(review.lesson_id), day_start)
            for review in reviews
        ],
        "daily_goal_minutes": user.daily_goal_minutes,
    }
