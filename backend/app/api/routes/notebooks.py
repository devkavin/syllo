from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject
from backend.app.database import get_session
from backend.app.models import Notebook, User
from backend.app.schemas.academics import NotebookCreate, NotebookPatch

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


def notebook_dict(notebook: Notebook, include_content: bool = True) -> dict:
    result = {
        "notebook_id": notebook.notebook_id,
        "subject_id": notebook.subject_id,
        "lesson_id": notebook.lesson_id,
        "title": notebook.title,
        "paper_style": notebook.paper_style,
        "font_style": notebook.font_style,
        "created_at": notebook.created_at.isoformat(),
        "updated_at": notebook.updated_at.isoformat(),
    }
    if include_content:
        result["content"] = notebook.content
        result["rich_content"] = notebook.rich_content
    return result


async def owned_notebook(
    session: AsyncSession, user_id: str, notebook_id: str
) -> Notebook:
    notebook = await session.scalar(
        select(Notebook).where(
            Notebook.notebook_id == notebook_id, Notebook.user_id == user_id
        )
    )
    if notebook is None:
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


async def validate_links(session, user_id, subject_id, lesson_id):
    lesson = await owned_lesson(session, user_id, lesson_id) if lesson_id else None
    if subject_id:
        await owned_subject(session, user_id, subject_id)
    if lesson and subject_id and lesson.subject_id != subject_id:
        raise HTTPException(status_code=400, detail="Lesson does not belong to subject")
    return subject_id or (lesson.subject_id if lesson else None)


@router.get("")
async def list_notebooks(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    notebooks = (
        await session.scalars(
            select(Notebook)
            .where(Notebook.user_id == user.user_id)
            .order_by(Notebook.updated_at.desc())
        )
    ).all()
    return [notebook_dict(notebook, include_content=False) for notebook in notebooks]


@router.get("/{notebook_id}")
async def get_notebook(
    notebook_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return notebook_dict(await owned_notebook(session, user.user_id, notebook_id))


@router.post("")
async def create_notebook(
    body: NotebookCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    subject_id = await validate_links(
        session, user.user_id, body.subject_id, body.lesson_id
    )
    notebook = Notebook(
        user_id=user.user_id,
        subject_id=subject_id,
        lesson_id=body.lesson_id,
        title=body.title,
        content=body.content,
        rich_content=body.rich_content,
        paper_style=body.paper_style,
        font_style=body.font_style,
    )
    session.add(notebook)
    await session.commit()
    await session.refresh(notebook)
    return notebook_dict(notebook)


@router.patch("/{notebook_id}")
async def patch_notebook(
    notebook_id: str,
    body: NotebookPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    notebook = await owned_notebook(session, user.user_id, notebook_id)
    data = body.model_dump(exclude_unset=True)
    if "content" in data and "rich_content" not in data:
        data["rich_content"] = None
    if "subject_id" in data or "lesson_id" in data:
        data["subject_id"] = await validate_links(
            session,
            user.user_id,
            data.get("subject_id", notebook.subject_id),
            data.get("lesson_id", notebook.lesson_id),
        )
    for field, value in data.items():
        setattr(notebook, field, value)
    await session.commit()
    await session.refresh(notebook)
    return notebook_dict(notebook)


@router.delete("/{notebook_id}")
async def delete_notebook(
    notebook_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    notebook = await owned_notebook(session, user.user_id, notebook_id)
    await session.delete(notebook)
    await session.commit()
    return {"ok": True}
