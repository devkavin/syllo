from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import Lesson, Review, Subject, Unit, User
from backend.app.services.study import ensure_review, lock_student
from backend.app.schemas.academics import (
    LessonCreate,
    LessonPatch,
    SubjectCreate,
    SubjectPatch,
    UnitCreate,
    UnitPatch,
)

router = APIRouter(tags=["academics"])


def subject_dict(subject: Subject) -> dict:
    return {
        "subject_id": subject.subject_id,
        "name": subject.name,
        "color": subject.color,
        "description": subject.description,
        "focus_minutes": subject.focus_minutes,
        "break_minutes": subject.break_minutes,
        "created_at": subject.created_at.isoformat(),
    }


def unit_dict(unit: Unit) -> dict:
    return {
        "unit_id": unit.unit_id,
        "subject_id": unit.subject_id,
        "name": unit.name,
        "description": unit.description,
        "order": unit.position,
        "created_at": unit.created_at.isoformat(),
    }


def lesson_dict(lesson: Lesson) -> dict:
    return {
        "lesson_id": lesson.lesson_id,
        "user_id": lesson.user_id,
        "subject_id": lesson.subject_id,
        "unit_id": lesson.unit_id,
        "title": lesson.title,
        "notes": lesson.notes,
        "status": lesson.status,
        "order": lesson.position,
        "total_seconds": lesson.total_seconds,
        "last_studied_at": (
            lesson.last_studied_at.isoformat() if lesson.last_studied_at else None
        ),
        "created_at": lesson.created_at.isoformat(),
    }


async def owned_subject(
    session: AsyncSession, user_id: str, subject_id: str
) -> Subject:
    subject = await session.scalar(
        select(Subject).where(
            Subject.subject_id == subject_id, Subject.user_id == user_id
        )
    )
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject


async def owned_unit(session: AsyncSession, user_id: str, unit_id: str) -> Unit:
    unit = await session.scalar(
        select(Unit).where(Unit.unit_id == unit_id, Unit.user_id == user_id)
    )
    if unit is None:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit


async def owned_lesson(session: AsyncSession, user_id: str, lesson_id: str) -> Lesson:
    lesson = await session.scalar(
        select(Lesson).where(Lesson.lesson_id == lesson_id, Lesson.user_id == user_id)
    )
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


@router.get("/subjects")
async def list_subjects(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    subjects = (
        await session.scalars(
            select(Subject)
            .where(Subject.user_id == user.user_id)
            .order_by(Subject.created_at)
        )
    ).all()
    return [subject_dict(subject) for subject in subjects]


@router.post("/subjects")
async def create_subject(
    body: SubjectCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    subject = Subject(user_id=user.user_id, **body.model_dump())
    session.add(subject)
    await session.commit()
    await session.refresh(subject)
    return subject_dict(subject)


@router.patch("/subjects/{subject_id}")
async def patch_subject(
    subject_id: str,
    body: SubjectPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    subject = await owned_subject(session, user.user_id, subject_id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(subject, field, value)
    await session.commit()
    await session.refresh(subject)
    return subject_dict(subject)


@router.delete("/subjects/{subject_id}")
async def delete_subject(
    subject_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await owned_subject(session, user.user_id, subject_id)
    await session.execute(
        delete(Lesson).where(
            Lesson.user_id == user.user_id, Lesson.subject_id == subject_id
        )
    )
    await session.execute(
        delete(Unit).where(Unit.user_id == user.user_id, Unit.subject_id == subject_id)
    )
    await session.execute(
        delete(Subject).where(
            Subject.user_id == user.user_id, Subject.subject_id == subject_id
        )
    )
    await session.commit()
    return {"ok": True}


@router.get("/subjects/{subject_id}/units")
async def list_units(
    subject_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await owned_subject(session, user.user_id, subject_id)
    units = (
        await session.scalars(
            select(Unit)
            .where(Unit.user_id == user.user_id, Unit.subject_id == subject_id)
            .order_by(Unit.position, Unit.created_at)
        )
    ).all()
    return [unit_dict(unit) for unit in units]


@router.post("/units")
async def create_unit(
    body: UnitCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await owned_subject(session, user.user_id, body.subject_id)
    data = body.model_dump()
    position = data.pop("order")
    unit = Unit(user_id=user.user_id, position=position, **data)
    session.add(unit)
    await session.commit()
    await session.refresh(unit)
    return unit_dict(unit)


@router.patch("/units/{unit_id}")
async def patch_unit(
    unit_id: str,
    body: UnitPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    unit = await owned_unit(session, user.user_id, unit_id)
    data = body.model_dump(exclude_none=True)
    if "order" in data:
        data["position"] = data.pop("order")
    for field, value in data.items():
        setattr(unit, field, value)
    await session.commit()
    await session.refresh(unit)
    return unit_dict(unit)


@router.delete("/units/{unit_id}")
async def delete_unit(
    unit_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await owned_unit(session, user.user_id, unit_id)
    await session.execute(
        delete(Lesson).where(Lesson.user_id == user.user_id, Lesson.unit_id == unit_id)
    )
    await session.execute(
        delete(Unit).where(Unit.user_id == user.user_id, Unit.unit_id == unit_id)
    )
    await session.commit()
    return {"ok": True}


@router.get("/units/{unit_id}/lessons")
async def list_lessons(
    unit_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    await owned_unit(session, user.user_id, unit_id)
    lessons = (
        await session.scalars(
            select(Lesson)
            .where(Lesson.user_id == user.user_id, Lesson.unit_id == unit_id)
            .order_by(Lesson.position, Lesson.created_at)
        )
    ).all()
    return [lesson_dict(lesson) for lesson in lessons]


@router.get("/lessons/{lesson_id}")
async def get_lesson(
    lesson_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return lesson_dict(await owned_lesson(session, user.user_id, lesson_id))


@router.post("/lessons")
async def create_lesson(
    body: LessonCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    unit = await owned_unit(session, user.user_id, body.unit_id)
    data = body.model_dump()
    position = data.pop("order")
    lesson = Lesson(
        user_id=user.user_id,
        subject_id=unit.subject_id,
        position=position,
        **data,
    )
    session.add(lesson)
    await session.commit()
    await session.refresh(lesson)
    return lesson_dict(lesson)


@router.patch("/lessons/{lesson_id}")
async def patch_lesson(
    lesson_id: str,
    body: LessonPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await lock_student(session, user.user_id)
    lesson = await owned_lesson(session, user.user_id, lesson_id)
    data = body.model_dump(exclude_none=True)
    if "order" in data:
        data["position"] = data.pop("order")
    status_was_done = lesson.status in {"done", "completed"}
    for field, value in data.items():
        setattr(lesson, field, value)
    if lesson.status in {"done", "completed"} and not status_was_done:
        await ensure_review(session, lesson)
    await session.commit()
    await session.refresh(lesson)
    return lesson_dict(lesson)


@router.delete("/lessons/{lesson_id}")
async def delete_lesson(
    lesson_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    lesson = await owned_lesson(session, user.user_id, lesson_id)
    await session.delete(lesson)
    await session.commit()
    return {"ok": True}


@router.get("/lessons/{lesson_id}/notebook")
async def lesson_notebook(lesson_id: str, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    from backend.app.models import Notebook
    from backend.app.api.routes.notebooks import notebook_dict

    await lock_student(session, user.user_id)
    lesson = await owned_lesson(session, user.user_id, lesson_id)
    notebooks = (await session.scalars(select(Notebook).where(Notebook.user_id == user.user_id, Notebook.lesson_id == lesson_id).order_by(Notebook.created_at, Notebook.notebook_id).with_for_update())).all()
    notebook = next((item for item in notebooks if item.deleted_at is None), None)
    if notebook is None and notebooks:
        raise HTTPException(409, {"message": "This lesson's notebook is in Trash. Restore it to continue writing.", "notebook_id": notebooks[0].notebook_id})
    if notebook is None:
        notebook = Notebook(user_id=user.user_id, subject_id=lesson.subject_id, lesson_id=lesson.lesson_id, title=lesson.title, content=lesson.notes, rich_content=None)
        session.add(notebook)
        await session.commit()
        await session.refresh(notebook)
    return notebook_dict(notebook)
