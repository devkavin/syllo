from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import User
from backend.app.services.scheduling import build_agenda

router = APIRouter(tags=["planner"])


@router.get("/agenda")
async def agenda(start: AwareDatetime, end: AwareDatetime, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    if end <= start or end - start > timedelta(days=31): raise HTTPException(422, "Choose a range of up to 31 days")
    return await build_agenda(session, user, start, end)
