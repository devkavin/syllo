from __future__ import annotations

import httpx
import pytest

from backend.app.config import Settings
from backend.app.main import create_app


class ExplodingSessionFactory:
    def __call__(self):
        raise AssertionError("liveness must not open a database session")


@pytest.mark.asyncio
async def test_live_health_does_not_require_database(
    test_settings_values: dict[str, object],
) -> None:
    settings = Settings(**test_settings_values, _env_file=None)
    app = create_app(settings, session_factory=ExplodingSessionFactory())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport,
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
