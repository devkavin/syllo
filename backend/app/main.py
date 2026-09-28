from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI

from backend.app.api import api_router
from backend.app.config import Settings, get_settings
from backend.app.database import (
    create_async_engine_from_settings,
    create_session_factory,
)
from backend.app.services.admin_bootstrap import ensure_admin


def create_app(
    settings: Settings,
    session_factory: Any = None,
    google_service: Any = None,
    stripe_service: Any = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = None
        if app.state.session_factory is None and settings.database_url:
            engine = create_async_engine_from_settings(settings)
            app.state.session_factory = create_session_factory(engine)
        if settings.admin_bootstrap_enabled:
            if app.state.session_factory is None:
                raise RuntimeError("Admin bootstrap requires a configured database")
            async with app.state.session_factory() as session:
                await ensure_admin(session, settings)
        try:
            yield
        finally:
            if engine is not None:
                await engine.dispose()

    app = FastAPI(title="Syllo API", lifespan=lifespan)
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.google_service = google_service
    app.state.stripe_service = stripe_service
    app.include_router(api_router)
    return app


app = create_app(get_settings())
