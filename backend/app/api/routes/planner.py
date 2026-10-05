from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_subject
from backend.app.database import get_session
from backend.app.models import TimetableEntry, User
from backend.app.schemas.academics import TimetableCreate, TimetablePatch
from backend.app.services.scheduling import lock_schedule_users, resolve_local_time, validate_timetable_conflicts, utc, user_timezone
from pydantic import ValidationError

router = APIRouter(prefix="/timetable", tags=["planner"])


def timetable_dict(item: TimetableEntry, user=None) -> dict:
    result = {
        "timetable_id": item.timetable_id,
        "subject_id": item.subject_id,
        "title": item.title,
        "date": item.scheduled_date.isoformat() if item.scheduled_date else None,
        "needs_date": item.recurrence == "none" and item.starts_at is None,
        "day_of_week": item.day_of_week,
        "start_time": item.start_time,
        "end_time": item.end_time,
        "location": item.location,
        "kind": item.kind,
        "recurrence": item.recurrence,
        "created_at": item.created_at.isoformat(),
    }
    if user and item.recurrence == "none" and item.starts_at and item.ends_at:
        start, end = (utc(value).astimezone(user_timezone(user)) for value in (item.starts_at, item.ends_at))
        result.update(date=start.date().isoformat(), end_date=end.date().isoformat(), day_of_week=start.weekday(), start_time=start.strftime("%H:%M"), end_time=end.strftime("%H:%M"))
    return result


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
    return [timetable_dict(item, user) for item in items]


@router.post("")
async def create_timetable(
    body: TimetableCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await lock_schedule_users(session, [user.user_id])
    if body.subject_id:
        await owned_subject(session, user.user_id, body.subject_id)
    item = TimetableEntry(user_id=user.user_id, **block_data(body, user))
    await validate_timetable_conflicts(session, user, item)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return timetable_dict(item, user)


@router.patch("/{timetable_id}")
async def patch_timetable(
    timetable_id: str,
    body: TimetablePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await lock_schedule_users(session, [user.user_id])
    item = await owned_timetable(session, user.user_id, timetable_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("subject_id"):
        await owned_subject(session, user.user_id, data["subject_id"])
    existing = timetable_dict(item, user)
    changes = body.model_dump(exclude_unset=True, by_alias=True, mode="json")
    schedule_changed = any(field in changes and changes[field] != existing[field] for field in ("date", "start_time", "end_time", "recurrence")) or body.utc_offset_minutes is not None
    if item.recurrence == "none" and item.starts_at and item.ends_at and not schedule_changed:
        # Full edit-form roundtrips and metadata edits must preserve the UTC instant,
        # including its fold choice and after the student's timezone changes.
        for field in ("title", "subject_id", "location", "kind"):
            if field in data:
                if data[field] is None and field != "subject_id": raise HTTPException(422, "Choose valid plan details")
                setattr(item, field, data[field])
    else:
        existing.update(changes)
        try: validated = TimetableCreate.model_validate(existing)
        except ValidationError: raise HTTPException(422, "Choose a date and valid start/end times for this plan")
        for field, value in block_data(validated, user).items():
            setattr(item, field, value)
    await validate_timetable_conflicts(session, user, item)
    await session.commit()
    await session.refresh(item)
    return timetable_dict(item, user)


@router.delete("/{timetable_id}")
async def delete_timetable(
    timetable_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await lock_schedule_users(session, [user.user_id])
    item = await owned_timetable(session, user.user_id, timetable_id)
    await session.delete(item)
    await session.commit()
    return {"ok": True}


def block_data(body, user):
    data = body.model_dump()
    offset = data.pop("utc_offset_minutes")
    data["starts_at"] = data["ends_at"] = None
    if body.recurrence == "none":
        data["day_of_week"] = body.scheduled_date.weekday()
        data["starts_at"] = resolve_local_time(user, body.scheduled_date, body.start_time, offset)
        data["ends_at"] = resolve_local_time(user, body.scheduled_date, body.end_time, offset)
    else: data["scheduled_date"] = None
    return data
