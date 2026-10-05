from fastapi import APIRouter, Depends
from sqlalchemy import delete, select
from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import AvailabilityWindow, AvailabilityExclusion
from backend.app.schemas.scheduling import Availability
from backend.app.services.scheduling import lock_schedule_users, utc

router = APIRouter(prefix="/availability", tags=["availability"])


@router.get("")
async def get_availability(user=Depends(get_current_user), session=Depends(get_session)):
    windows = (await session.scalars(select(AvailabilityWindow).where(AvailabilityWindow.user_id == user.user_id))).all()
    exclusions = (await session.scalars(select(AvailabilityExclusion).where(AvailabilityExclusion.user_id == user.user_id))).all()
    return {"windows": [{"day_of_week": w.day_of_week, "start_time": w.start_time, "end_time": w.end_time} for w in windows], "exclusions": [{"start": utc(e.starts_at).isoformat(), "end": utc(e.ends_at).isoformat()} for e in exclusions]}


@router.put("")
async def set_availability(body: Availability, user=Depends(get_current_user), session=Depends(get_session)):
    await lock_schedule_users(session, [user.user_id])
    await session.execute(delete(AvailabilityWindow).where(AvailabilityWindow.user_id == user.user_id))
    await session.execute(delete(AvailabilityExclusion).where(AvailabilityExclusion.user_id == user.user_id))
    session.add_all([AvailabilityWindow(user_id=user.user_id, **w.model_dump()) for w in body.windows])
    session.add_all([AvailabilityExclusion(user_id=user.user_id, starts_at=utc(e.start), ends_at=utc(e.end)) for e in body.exclusions])
    await session.commit()
    return body.model_dump(mode="json")
