from fastapi import APIRouter

api_router = APIRouter(prefix="/api")


@api_router.get("/health/live", tags=["health"])
async def live_health() -> dict[str, str]:
    return {"status": "ok"}
