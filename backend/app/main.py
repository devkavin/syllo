from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from backend.app.api import api_router
from backend.app.config import Settings, get_settings


def create_app(
    settings: Settings,
    session_factory: Any = None,
    google_service: Any = None,
    stripe_service: Any = None,
) -> FastAPI:
    app = FastAPI(title="Syllo API")
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.google_service = google_service
    app.state.stripe_service = stripe_service
    app.include_router(api_router)
    return app


app = create_app(get_settings())
