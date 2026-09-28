from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database import get_session
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.billing import router as billing_router
from backend.app.api.routes.academics import router as academics_router
from backend.app.api.routes.admin import router as admin_router
from backend.app.api.routes.ai import router as ai_router
from backend.app.api.routes.google_auth import router as google_auth_router
from backend.app.api.routes.notebooks import router as notebooks_router
from backend.app.api.routes.planner import router as planner_router
from backend.app.api.routes.progress import router as progress_router
from backend.app.api.routes.referrals import router as referrals_router
from backend.app.api.routes.search import router as search_router
from backend.app.api.routes.sessions import router as sessions_router
from backend.app.api.routes.tasks import router as tasks_router
from backend.app.api.routes.stripe_webhooks import router as stripe_webhook_router

api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(billing_router)
api_router.include_router(stripe_webhook_router)
api_router.include_router(google_auth_router)
api_router.include_router(academics_router)
api_router.include_router(notebooks_router)
api_router.include_router(tasks_router)
api_router.include_router(planner_router)
api_router.include_router(sessions_router)
api_router.include_router(search_router)
api_router.include_router(progress_router)
api_router.include_router(ai_router)
api_router.include_router(referrals_router)
api_router.include_router(admin_router)


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
