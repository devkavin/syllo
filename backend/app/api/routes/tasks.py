from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject, owned_unit
from backend.app.database import get_session
from backend.app.models import Task, User
from backend.app.schemas.academics import TaskCreate, TaskPatch

router = APIRouter(prefix="/tasks", tags=["tasks"])


def task_dict(task: Task) -> dict:
    return {
        "task_id": task.task_id,
        "subject_id": task.subject_id,
        "unit_id": task.unit_id,
        "lesson_id": task.lesson_id,
        "title": task.title,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "due_time": task.due_time,
        "priority": task.priority,
        "reminder_at": task.reminder_at.isoformat() if task.reminder_at else None,
        "notes": task.notes,
        "completed": task.completed,
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "created_at": task.created_at.isoformat(),
    }


async def owned_task(session: AsyncSession, user_id: str, task_id: str) -> Task:
    task = await session.scalar(
        select(Task).where(Task.task_id == task_id, Task.user_id == user_id)
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def resolve_links(session, user_id, subject_id, unit_id, lesson_id):
    lesson = await owned_lesson(session, user_id, lesson_id) if lesson_id else None
    unit = await owned_unit(session, user_id, unit_id) if unit_id else None
    if subject_id:
        await owned_subject(session, user_id, subject_id)
    if lesson:
        if unit and lesson.unit_id != unit.unit_id:
            raise HTTPException(
                status_code=400, detail="Lesson does not belong to unit"
            )
        if subject_id and lesson.subject_id != subject_id:
            raise HTTPException(
                status_code=400, detail="Lesson does not belong to subject"
            )
        return lesson.subject_id, lesson.unit_id, lesson.lesson_id
    if unit:
        if subject_id and unit.subject_id != subject_id:
            raise HTTPException(
                status_code=400, detail="Unit does not belong to subject"
            )
        return unit.subject_id, unit.unit_id, None
    return subject_id, None, None


@router.get("")
async def list_tasks(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    tasks = (
        await session.scalars(
            select(Task)
            .where(Task.user_id == user.user_id)
            .order_by(Task.created_at.desc())
        )
    ).all()
    return [task_dict(task) for task in tasks]


@router.post("")
async def create_task(
    body: TaskCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    subject_id, unit_id, lesson_id = await resolve_links(
        session, user.user_id, body.subject_id, body.unit_id, body.lesson_id
    )
    data = body.model_dump(exclude={"subject_id", "unit_id", "lesson_id"})
    task = Task(
        user_id=user.user_id,
        subject_id=subject_id,
        unit_id=unit_id,
        lesson_id=lesson_id,
        **data,
    )
    session.add(task)
    await session.commit()
    await session.refresh(task)
    return task_dict(task)


@router.patch("/{task_id}")
async def patch_task(
    task_id: str,
    body: TaskPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    from backend.app.api.routes.revision_plans import validate_generated_task_edit
    from backend.app.services.study import lock_student

    await lock_student(session, user.user_id)
    task = await owned_task(session, user.user_id, task_id)
    data = body.model_dump(exclude_unset=True)
    await validate_generated_task_edit(session, user, task, data)
    link_fields = {"subject_id", "unit_id", "lesson_id"}
    if link_fields.intersection(data):
        subject_id, unit_id, lesson_id = await resolve_links(
            session,
            user.user_id,
            data.get("subject_id", task.subject_id),
            data.get("unit_id", task.unit_id),
            data.get("lesson_id", task.lesson_id),
        )
        data.update(subject_id=subject_id, unit_id=unit_id, lesson_id=lesson_id)
    if "completed" in data:
        data["completed_at"] = datetime.now(timezone.utc) if data["completed"] else None
    for field, value in data.items():
        setattr(task, field, value)
    await session.commit()
    await session.refresh(task)
    return task_dict(task)


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    task = await owned_task(session, user.user_id, task_id)
    await session.delete(task)
    await session.commit()
    return {"ok": True}
