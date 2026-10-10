from __future__ import annotations

from copy import deepcopy

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject
from backend.app.database import get_session
from backend.app.models import Notebook, NotebookVersion, Subject, Lesson, User, base
from backend.app.schemas.academics import NotebookCreate, NotebookPatch
from backend.app.services.study import lock_student
from backend.app.services.scheduling import utc

router = APIRouter(prefix="/notebooks", tags=["notebooks"])

SNAPSHOT_FIELDS = (
    "title",
    "content",
    "rich_content",
    "paper_style",
    "font_style",
    "subject_id",
    "lesson_id",
)


class RestoreNotebook(BaseModel):
    expected_revision: int = Field(ge=1)


def notebook_dict(notebook: Notebook, include_content: bool = True) -> dict:
    result = {
        "notebook_id": notebook.notebook_id,
        "subject_id": notebook.subject_id,
        "lesson_id": notebook.lesson_id,
        "title": notebook.title,
        "paper_style": notebook.paper_style,
        "font_style": notebook.font_style,
        "revision": notebook.revision,
        "deleted_at": (
            utc(notebook.deleted_at).isoformat() if notebook.deleted_at else None
        ),
        "created_at": utc(notebook.created_at).isoformat(),
        "updated_at": utc(notebook.updated_at).isoformat(),
    }
    if include_content:
        result["content"] = notebook.content
        result["rich_content"] = notebook.rich_content
    return result


async def owned_notebook(
    session: AsyncSession,
    user_id: str,
    notebook_id: str,
    *,
    include_deleted: bool = False,
) -> Notebook:
    notebook = await session.scalar(
        select(Notebook)
        .where(Notebook.notebook_id == notebook_id, Notebook.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if notebook is None or (not include_deleted and notebook.deleted_at is not None):
        raise HTTPException(status_code=404, detail="Notebook not found")
    return notebook


def check_revision(notebook, expected_revision):
    if expected_revision is not None and expected_revision != notebook.revision:
        raise HTTPException(
            409,
            {
                "message": "This notebook changed. Review the saved version before trying again.",
                "current": notebook_dict(notebook),
            },
        )


async def change_notebook(session, notebook, data, expected_revision=None):
    check_revision(notebook, expected_revision)
    if not data or all(getattr(notebook, key) == value for key, value in data.items()):
        return notebook
    revision = notebook.revision
    snapshot = {field: deepcopy(getattr(notebook, field)) for field in SNAPSHOT_FIELDS}
    result = await session.execute(
        update(Notebook)
        .where(
            Notebook.notebook_id == notebook.notebook_id,
            Notebook.user_id == notebook.user_id,
            Notebook.revision == revision,
        )
        .values(**{**data, "revision": revision + 1, "updated_at": base.utc_now()})
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        await session.refresh(notebook)
        check_revision(notebook, revision)
    session.add(
        NotebookVersion(notebook_id=notebook.notebook_id, revision=revision, **snapshot)
    )
    await session.flush()
    expired = (
        await session.scalars(
            select(NotebookVersion.version_id)
            .where(NotebookVersion.notebook_id == notebook.notebook_id)
            .order_by(NotebookVersion.revision.desc())
            .offset(30)
        )
    ).all()
    if expired:
        await session.execute(
            delete(NotebookVersion).where(NotebookVersion.version_id.in_(expired))
        )
    await session.commit()
    await session.refresh(notebook)
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
    trash: bool = False,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    notebooks = (
        await session.scalars(
            select(Notebook)
            .where(
                Notebook.user_id == user.user_id,
                (
                    Notebook.deleted_at.is_not(None)
                    if trash
                    else Notebook.deleted_at.is_(None)
                ),
            )
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
    await lock_student(session, user.user_id)
    notebook = await owned_notebook(session, user.user_id, notebook_id)
    data = body.model_dump(exclude_unset=True)
    expected_revision = data.pop("expected_revision", None)
    check_revision(notebook, expected_revision)
    if any(data.get(field) is None for field in ("title", "content") if field in data):
        raise HTTPException(422, "Notebook title and content cannot be null")
    if "content" in data and "rich_content" not in data:
        data["rich_content"] = None
    if "subject_id" in data or "lesson_id" in data:
        data["subject_id"] = await validate_links(
            session,
            user.user_id,
            data.get("subject_id", notebook.subject_id),
            data.get("lesson_id", notebook.lesson_id),
        )
    await change_notebook(session, notebook, data, expected_revision)
    return notebook_dict(notebook)


@router.delete("/{notebook_id}")
async def delete_notebook(
    notebook_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await lock_student(session, user.user_id)
    notebook = await owned_notebook(session, user.user_id, notebook_id)
    await change_notebook(session, notebook, {"deleted_at": base.utc_now()})
    return {"ok": True}


@router.get("/{notebook_id}/history")
async def notebook_history(
    notebook_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await owned_notebook(session, user.user_id, notebook_id, include_deleted=True)
    versions = (
        await session.scalars(
            select(NotebookVersion)
            .where(NotebookVersion.notebook_id == notebook_id)
            .order_by(NotebookVersion.revision.desc())
        )
    ).all()
    return [
        {
            "version_id": version.version_id,
            "revision": version.revision,
            **{field: getattr(version, field) for field in SNAPSHOT_FIELDS},
            "created_at": utc(version.created_at).isoformat(),
        }
        for version in versions
    ]


@router.post("/{notebook_id}/history/{version_id}/restore")
async def restore_version(
    notebook_id: str,
    version_id: str,
    body: RestoreNotebook,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    notebook = await owned_notebook(session, user.user_id, notebook_id)
    version = await session.scalar(
        select(NotebookVersion).where(
            NotebookVersion.notebook_id == notebook_id,
            NotebookVersion.version_id == version_id,
        )
    )
    if version is None:
        raise HTTPException(404, "Notebook version not found")
    check_revision(notebook, body.expected_revision)
    data = {field: deepcopy(getattr(version, field)) for field in SNAPSHOT_FIELDS}
    # Preserve text when historical academic links were deleted.
    subject = (
        await session.scalar(
            select(Subject).where(
                Subject.user_id == user.user_id,
                Subject.subject_id == version.subject_id,
            )
        )
        if version.subject_id
        else None
    )
    lesson = (
        await session.scalar(
            select(Lesson).where(
                Lesson.user_id == user.user_id, Lesson.lesson_id == version.lesson_id
            )
        )
        if version.lesson_id
        else None
    )
    data.update(
        subject_id=(
            lesson.subject_id if lesson else subject.subject_id if subject else None
        ),
        lesson_id=lesson.lesson_id if lesson else None,
    )
    # Restoring a snapshot is a versioned action even when the text matches.
    data["updated_at"] = base.utc_now()
    await change_notebook(session, notebook, data, body.expected_revision)
    return notebook_dict(notebook)


@router.post("/{notebook_id}/restore")
async def restore_notebook(
    notebook_id: str,
    body: RestoreNotebook,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    notebook = await owned_notebook(
        session, user.user_id, notebook_id, include_deleted=True
    )
    await change_notebook(
        session, notebook, {"deleted_at": None}, body.expected_revision
    )
    return notebook_dict(notebook)
