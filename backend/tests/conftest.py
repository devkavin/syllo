from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Base, Plan


@pytest.fixture
def test_settings_values() -> dict[str, object]:
    return {
        "environment": "test",
        "app_url": "http://testserver",
        "database_url": "sqlite+aiosqlite:///:memory:",
        "jwt_secret": "test-jwt-secret-with-at-least-32-characters",
        "oauth_state_secret": "test-oauth-secret-with-at-least-32-characters",
        "cookie_secure": False,
        "billing_enabled": True,
    }


@pytest_asyncio.fixture
async def sql_app(test_settings_values):
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                Plan(plan_id="freshman", name="Freshman", price_cents=0, credits=40),
                Plan(plan_id="scholar", name="Scholar", price_cents=899, credits=300),
                Plan(
                    plan_id="deans_list",
                    name="Dean's List",
                    price_cents=1399,
                    credits=1000,
                ),
            ]
        )
        await session.commit()
    settings = Settings(**test_settings_values, _env_file=None)
    app = create_app(settings, session_factory=factory)
    yield app, factory
    await engine.dispose()
