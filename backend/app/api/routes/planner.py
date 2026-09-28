from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_subject
from backend.app.database import get_session
from backend.app.models import TimetableEntry, User
from backend.app.schemas.academics import TimetableCreate, TimetablePatch

router = APIRouter(prefix="/timetable", tags=["planner"])


def timetable_dict(item: TimetableEntry) -> dict:
    return {
        "timetable_id": item.timetable_id,
        "subject_id": item.subject_id,
        "title": item.title,
        "day_of_week": item.day_of_week,
        "start_time": item.start_time,
        "end_time": item.end_time,
        "location": item.location,
        "kind": item.kind,
        "recurrence": item.recurrence,
        "created_at": item.created_at.isoformat(),
    }


async def owned_timetable(session, user_id, timetable_id):
    item = await session.scalar(
        select(TimetableEntry).where(
            TimetableEntry.timetable_id == timetable_id,
            TimetableEntry.user_id == user_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Timetable item not found")
    return item


@router.get("")
async def list_timetable(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    items = (
        await session.scalars(
            select(TimetableEntry)
            .where(TimetableEntry.user_id == user.user_id)
            .order_by(TimetableEntry.day_of_week, TimetableEntry.start_time)
        )
    ).all()
    return [timetable_dict(item) for item in items]


@router.post("")
async def create_timetable(
    body: TimetableCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if body.subject_id:
        await owned_subject(session, user.user_id, body.subject_id)
    item = TimetableEntry(user_id=user.user_id, **body.model_dump())
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return timetable_dict(item)


@router.patch("/{timetable_id}")
async def patch_timetable(
    timetable_id: str,
    body: TimetablePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    item = await owned_timetable(session, user.user_id, timetable_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("subject_id"):
        await owned_subject(session, user.user_id, data["subject_id"])
    for field, value in data.items():
        setattr(item, field, value)
    await session.commit()
    await session.refresh(item)
    return timetable_dict(item)


@router.delete("/{timetable_id}")
async def delete_timetable(
    timetable_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    item = await owned_timetable(session, user.user_id, timetable_id)
    await session.delete(item)
    await session.commit()
    return {"ok": True}
