from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import User
from backend.app.services.progress import build_progress

router = APIRouter(tags=["progress"])


@router.get("/analytics")
async def analytics(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await build_progress(session, user.user_id)
