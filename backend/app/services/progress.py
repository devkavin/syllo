from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models import Lesson, Review, Streak, StudySession, Subject


async def build_progress(session: AsyncSession, user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    month_start = now - timedelta(days=30)
    total, count, lessons_studied = (
        await session.execute(
            select(
                func.coalesce(func.sum(StudySession.duration_seconds), 0),
                func.count(StudySession.session_id),
                func.count(distinct(StudySession.lesson_id)),
            ).where(StudySession.user_id == user_id)
        )
    ).one()
    # Separate filtered sums are portable across SQLite tests and MySQL production.
    weekly = await session.scalar(
        select(func.coalesce(func.sum(StudySession.duration_seconds), 0)).where(
            StudySession.user_id == user_id, StudySession.started_at >= week_start
        )
    )
    monthly = await session.scalar(
        select(func.coalesce(func.sum(StudySession.duration_seconds), 0)).where(
            StudySession.user_id == user_id, StudySession.started_at >= month_start
        )
    )
    by_subject_rows = (
        await session.execute(
            select(
                Subject.subject_id,
                Subject.name,
                Subject.color,
                func.sum(StudySession.duration_seconds).label("seconds"),
            )
            .join(StudySession, StudySession.subject_id == Subject.subject_id)
            .where(Subject.user_id == user_id, StudySession.user_id == user_id)
            .group_by(Subject.subject_id, Subject.name, Subject.color)
            .order_by(func.sum(StudySession.duration_seconds).desc())
        )
    ).all()
    daily_rows = (
        await session.execute(
            select(
                func.date(StudySession.started_at).label("day"),
                func.sum(StudySession.duration_seconds).label("seconds"),
            )
            .where(
                StudySession.user_id == user_id,
                StudySession.started_at >= month_start,
            )
            .group_by(func.date(StudySession.started_at))
        )
    ).all()
    by_day = {str(row.day): int(row.seconds) for row in daily_rows}
    heatmap = [
        {
            "day": (now - timedelta(days=offset)).date().isoformat(),
            "seconds": by_day.get((now - timedelta(days=offset)).date().isoformat(), 0),
        }
        for offset in range(29, -1, -1)
    ]
    reviews_completed = await session.scalar(
        select(func.count())
        .select_from(Review)
        .where(Review.user_id == user_id, Review.completed_at.is_not(None))
    )
    curriculum_total = await session.scalar(
        select(func.count()).select_from(Lesson).where(Lesson.user_id == user_id)
    )
    curriculum_completed = await session.scalar(
        select(func.count())
        .select_from(Lesson)
        .where(Lesson.user_id == user_id, Lesson.status.in_(("done", "completed")))
    )
    streak = await session.get(Streak, user_id)
    return {
        "total_seconds": int(total or 0),
        "weekly_seconds": int(weekly or 0),
        "monthly_seconds": int(monthly or 0),
        "sessions_completed": int(count or 0),
        "lessons_studied": int(lessons_studied or 0),
        "reviews_completed": int(reviews_completed or 0),
        "curriculum": {
            "completed": int(curriculum_completed or 0),
            "total": int(curriculum_total or 0),
        },
        "daily": heatmap[-14:],
        "heatmap": heatmap,
        "by_subject": [
            {
                "subject_id": row.subject_id,
                "name": row.name,
                "color": row.color,
                "seconds": int(row.seconds),
            }
            for row in by_subject_rows
        ],
        "streak": {
            "current": streak.current if streak else 0,
            "longest": streak.longest if streak else 0,
        },
    }
