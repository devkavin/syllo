from __future__ import annotations

from datetime import timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.notebooks import owned_notebook, validate_links
from backend.app.database import get_session
from backend.app.models import Lesson, StudyAttempt, StudyQuestion, Subject, User, base
from backend.app.services.scheduling import utc
from backend.app.services.study import lock_student

router = APIRouter(prefix="/study", tags=["study"])
TEXT_FIELDS = ("prompt", "answer", "mistake", "correction")


class QuestionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notebook_id: str | None = None
    subject_id: str | None = None
    lesson_id: str | None = None
    kind: Literal["question", "mistake"] = "question"
    prompt: str = Field(min_length=1, max_length=20000)
    answer: str = Field(default="", max_length=50000)
    mistake: str = Field(default="", max_length=50000)
    correction: str = Field(default="", max_length=50000)

    @field_validator("prompt")
    @classmethod
    def nonblank_prompt(cls, value):
        if not value.strip():
            raise ValueError("Write a practice prompt")
        return value


class QuestionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    kind: Literal["question", "mistake"] | None = None
    prompt: str | None = Field(default=None, min_length=1, max_length=20000)
    answer: str | None = Field(default=None, max_length=50000)
    mistake: str | None = Field(default=None, max_length=50000)
    correction: str | None = Field(default=None, max_length=50000)

    @field_validator(*TEXT_FIELDS)
    @classmethod
    def valid_text(cls, value, info):
        if value is None or (info.field_name == "prompt" and not value.strip()):
            raise ValueError("Practice text cannot be null or the prompt blank")
        return value


class QuestionAttempt(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quality: Literal["again", "hard", "good"]
    expected_revision: int = Field(ge=1)
    request_id: UUID


def question_dict(item):
    return {
        "question_id": item.question_id,
        "notebook_id": item.notebook_id,
        "subject_id": item.subject_id,
        "lesson_id": item.lesson_id,
        "kind": item.kind,
        **{field: getattr(item, field) for field in TEXT_FIELDS},
        "confidence": item.confidence,
        "interval_days": item.interval_days,
        "next_review_at": utc(item.next_review_at).isoformat(),
        "attempts": item.attempts,
        "successes": item.successes,
        "revision": item.revision,
        "created_at": utc(item.created_at).isoformat(),
        "updated_at": utc(item.updated_at).isoformat(),
    }


async def owned_question(session, user_id, question_id):
    item = await session.scalar(
        select(StudyQuestion)
        .where(
            StudyQuestion.user_id == user_id, StudyQuestion.question_id == question_id
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if item is None:
        raise HTTPException(404, "Practice question not found")
    return item


def check_revision(item, revision):
    if item.revision != revision:
        raise HTTPException(
            409,
            {
                "message": "This practice question changed. Refresh before trying again.",
                "current": question_dict(item),
            },
        )


async def update_question(session, item, revision, data):
    check_revision(item, revision)
    result = await session.execute(
        update(StudyQuestion)
        .where(
            StudyQuestion.user_id == item.user_id,
            StudyQuestion.question_id == item.question_id,
            StudyQuestion.revision == revision,
        )
        .values(**{**data, "revision": revision + 1, "updated_at": base.utc_now()})
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        await session.refresh(item)
        check_revision(item, revision)
    await session.refresh(item)


@router.get("/questions")
async def list_questions(
    notebook_id: str | None = None,
    kind: Literal["question", "mistake"] | None = None,
    due: bool = False,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    query = select(StudyQuestion).where(StudyQuestion.user_id == user.user_id)
    if notebook_id:
        await owned_notebook(session, user.user_id, notebook_id)
        query = query.where(StudyQuestion.notebook_id == notebook_id)
    if kind:
        query = query.where(StudyQuestion.kind == kind)
    if due:
        query = query.where(StudyQuestion.next_review_at <= base.utc_now())
    items = (
        await session.scalars(
            query.order_by(StudyQuestion.next_review_at, StudyQuestion.created_at)
        )
    ).all()
    return [question_dict(item) for item in items]


@router.post("/questions")
async def create_question(
    body: QuestionCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    notebook = (
        await owned_notebook(session, user.user_id, body.notebook_id)
        if body.notebook_id
        else None
    )
    subject_id, lesson_id = body.subject_id, body.lesson_id
    if notebook:
        if (
            subject_id
            and notebook.subject_id
            and subject_id != notebook.subject_id
            or lesson_id
            and notebook.lesson_id
            and lesson_id != notebook.lesson_id
        ):
            raise HTTPException(422, "Practice links do not match the notebook")
        subject_id, lesson_id = (
            subject_id or notebook.subject_id,
            lesson_id or notebook.lesson_id,
        )
    subject_id = await validate_links(session, user.user_id, subject_id, lesson_id)
    item = StudyQuestion(
        user_id=user.user_id,
        **{**body.model_dump(), "subject_id": subject_id, "lesson_id": lesson_id},
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return question_dict(item)


@router.patch("/questions/{question_id}")
async def patch_question(
    question_id: str,
    body: QuestionPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    item = await owned_question(session, user.user_id, question_id)
    data = body.model_dump(exclude_unset=True, exclude={"expected_revision"})
    if "kind" in data and data.pop("kind") != item.kind:
        raise HTTPException(422, "A practice question's kind cannot be changed")
    await update_question(session, item, body.expected_revision, data)
    await session.commit()
    return question_dict(item)


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    item = await owned_question(session, user.user_id, question_id)
    # The ledger represents completed self-assessments even after a card is removed.
    await session.execute(
        update(StudyAttempt)
        .where(
            StudyAttempt.user_id == user.user_id,
            StudyAttempt.question_id == question_id,
        )
        .values(question_id=None)
    )
    await session.delete(item)
    await session.commit()
    return {"ok": True}


async def topic_title(session, item):
    if item.lesson_id:
        lesson = await session.scalar(
            select(Lesson).where(
                Lesson.user_id == item.user_id, Lesson.lesson_id == item.lesson_id
            )
        )
        if lesson:
            return lesson.title
    if item.subject_id:
        subject = await session.scalar(
            select(Subject).where(
                Subject.user_id == item.user_id, Subject.subject_id == item.subject_id
            )
        )
        if subject:
            return subject.name
    return "Independent practice"


def replay_attempt(previous, payload, item):
    if previous.payload != payload:
        raise HTTPException(
            409, "This practice request was already used for another action."
        )
    return question_dict(item)


@router.post("/questions/{question_id}/attempt")
async def attempt_question(
    question_id: str,
    body: QuestionAttempt,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user_id = user.user_id
    await lock_student(session, user_id)
    item = await owned_question(session, user_id, question_id)
    payload = {"question_id": question_id, **body.model_dump(mode="json")}
    previous = await session.get(StudyAttempt, (user_id, str(body.request_id)))
    if previous:
        return replay_attempt(previous, payload, item)
    interval = (
        1
        if body.quality == "again"
        else 2 if body.quality == "hard" else min(60, max(3, item.interval_days * 2))
    )
    title = await topic_title(session, item)
    try:
        await update_question(
            session,
            item,
            body.expected_revision,
            {
                "confidence": body.quality,
                "interval_days": interval,
                "next_review_at": base.utc_now() + timedelta(days=interval),
                "attempts": item.attempts + 1,
                "successes": item.successes + int(body.quality == "good"),
            },
        )
        session.add(
            StudyAttempt(
                user_id=user_id,
                request_id=str(body.request_id),
                question_id=question_id,
                subject_id=item.subject_id,
                lesson_id=item.lesson_id,
                topic_title=title,
                quality=body.quality,
                payload=payload,
            )
        )
        await session.commit()
    except (HTTPException, IntegrityError) as error:
        if isinstance(error, HTTPException) and error.status_code != 409:
            raise
        # The unique account/request pair is the final guard for overlapping retries.
        # A retry may have read before the first request committed its ledger row;
        # after a failed conditional update, reopen the transaction and replay it.
        await session.rollback()
        item = await owned_question(session, user_id, question_id)
        previous = await session.get(StudyAttempt, (user_id, str(body.request_id)))
        if previous:
            return replay_attempt(previous, payload, item)
        raise
    return question_dict(item)


@router.get("/progress")
async def practice_progress(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
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
    topics = {}
    for item in questions:
        key = (item.lesson_id, item.subject_id)
        if key not in topics:
            topics[key] = {
                "lesson_id": item.lesson_id,
                "subject_id": item.subject_id,
                "title": await topic_title(session, item),
                "attempts": 0,
                "successful_attempts": 0,
                "needs_practice": 0,
                "last_quality": None,
            }
        if item.confidence != "good":
            topics[key]["needs_practice"] += 1
    for attempt in attempts:
        key = (attempt.lesson_id, attempt.subject_id)
        if key not in topics:
            topics[key] = {
                "lesson_id": attempt.lesson_id,
                "subject_id": attempt.subject_id,
                "title": attempt.topic_title,
                "attempts": 0,
                "successful_attempts": 0,
                "needs_practice": 0,
                "last_quality": None,
            }
        topics[key]["attempts"] += 1
        topics[key]["successful_attempts"] += int(attempt.quality == "good")
        topics[key]["last_quality"] = attempt.quality
    now = base.utc_now()
    return {
        "questions_count": sum(item.kind == "question" for item in questions),
        "mistakes_count": sum(item.kind == "mistake" for item in questions),
        "attempts_count": len(attempts),
        "successful_attempts": sum(item.quality == "good" for item in attempts),
        "due_count": sum(utc(item.next_review_at) <= now for item in questions),
        "topics": list(topics.values()),
    }
