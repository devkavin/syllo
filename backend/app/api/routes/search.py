from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import lesson_dict, subject_dict
from backend.app.api.routes.notebooks import notebook_dict
from backend.app.api.routes.tasks import task_dict
from backend.app.database import get_session
from backend.app.models import Lesson, Notebook, Subject, Task, User

router = APIRouter(tags=["search"])


@router.get("/search")
async def search(
    q: str = Query(default="", max_length=200),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, list[dict]]:
    query = q.strip()
    empty = {"subjects": [], "lessons": [], "notebooks": [], "tasks": []}
    if not query:
        return empty
    pattern = f"%{query}%"
    subjects = (
        await session.scalars(
            select(Subject)
            .where(Subject.user_id == user.user_id, Subject.name.ilike(pattern))
            .limit(8)
        )
    ).all()
    lessons = (
        await session.scalars(
            select(Lesson)
            .where(Lesson.user_id == user.user_id, Lesson.title.ilike(pattern))
            .limit(10)
        )
    ).all()
    notebooks = (
        await session.scalars(
            select(Notebook)
            .where(
                Notebook.user_id == user.user_id,
                or_(Notebook.title.ilike(pattern), Notebook.content.ilike(pattern)),
            )
            .limit(10)
        )
    ).all()
    tasks = (
        await session.scalars(
            select(Task)
            .where(Task.user_id == user.user_id, Task.title.ilike(pattern))
            .limit(10)
        )
    ).all()
    return {
        "subjects": [subject_dict(item) for item in subjects],
        "lessons": [lesson_dict(item) for item in lessons],
        "notebooks": [notebook_dict(item, include_content=False) for item in notebooks],
        "tasks": [task_dict(item) for item in tasks],
    }
