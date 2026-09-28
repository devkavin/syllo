from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_session
from backend.app.api.routes.auth import router as auth_router

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)


@api_router.get("/health/live", tags=["health"])
async def live_health() -> dict[str, str]:
    return {"status": "ok"}


@api_router.get("/health/ready", tags=["health"])
async def ready_health(
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ready"}
