from __future__ import annotations

import httpx
import pytest

from backend.app.config import Settings
from backend.app.main import create_app


class ExplodingSessionFactory:
    def __call__(self):
        raise AssertionError("liveness must not open a database session")


class FakeSession:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.executed = False

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def execute(self, statement):
        self.executed = True
        if self.error:
            raise self.error


class FakeSessionFactory:
    def __init__(self, session: FakeSession) -> None:
        self.session = session

    def __call__(self) -> FakeSession:
        return self.session


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


@pytest.mark.asyncio
async def test_readiness_checks_database(
    test_settings_values: dict[str, object],
) -> None:
    session = FakeSession()
    app = create_app(
        Settings(**test_settings_values, _env_file=None),
        session_factory=FakeSessionFactory(session),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert session.executed is True


@pytest.mark.asyncio
async def test_readiness_fails_closed(test_settings_values: dict[str, object]) -> None:
    app = create_app(
        Settings(**test_settings_values, _env_file=None),
        session_factory=FakeSessionFactory(FakeSession(RuntimeError("database down"))),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.get("/api/health/ready")

    assert response.status_code == 503
    assert response.json() == {"detail": "Database is not ready"}
