"""Shared serialized review writes; no automatic content copies."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import select, update
from backend.app.models import Lesson, Review, User


async def lock_student(session, user_id):
    if session.get_bind().dialect.name == "sqlite":
        # SQLite ignores FOR UPDATE. Acquire its write lock before the read so
        # first creation and overlapping retries serialize just as on MySQL.
        # Explicitly retain updated_at: obtaining a lock is not a profile edit.
        await session.execute(update(User).where(User.user_id == user_id).values(updated_at=User.updated_at).execution_options(synchronize_session=False))
    await session.scalar(select(User).where(User.user_id == user_id).with_for_update().execution_options(populate_existing=True))


async def ensure_review(session, lesson, next_review_at=None):
    review = await session.scalar(select(Review).where(Review.user_id == lesson.user_id, Review.lesson_id == lesson.lesson_id).with_for_update().execution_options(populate_existing=True))
    if review is None:
        review = Review(user_id=lesson.user_id, lesson_id=lesson.lesson_id, next_review_at=next_review_at or datetime.now(timezone.utc) + timedelta(days=1))
        session.add(review)
    elif next_review_at is not None:
        review.next_review_at = next_review_at
        review.completed_at = None
    return review


async def schedule_review(session, user, lesson_id, next_review_at):
    await lock_student(session, user.user_id)
    lesson = await session.scalar(select(Lesson).where(Lesson.lesson_id == lesson_id, Lesson.user_id == user.user_id))
    if lesson is None:
        raise HTTPException(404, "Lesson not found")
    due = next_review_at.astimezone(timezone.utc)
    if due <= datetime.now(timezone.utc):
        raise HTTPException(422, "Choose a future review time")
    review = await ensure_review(session, lesson, due)
    await session.commit()
    await session.refresh(review)
    return review, lesson
