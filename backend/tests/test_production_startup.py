from __future__ import annotations

import httpx
import pytest
from alembic.script import ScriptDirectory
from pydantic import ValidationError
from sqlalchemy import func, select

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import User
from backend.app.startup import migration_config, run_migrations


def production_values() -> dict[str, object]:
    return {
        "environment": "production",
        "app_url": "https://syllo.kavinhq.com",
        "database_url": "mysql+asyncmy://user:pass@db.example:3306/syllo",
        "jwt_secret": "jwt-secret-with-at-least-32-characters",
        "oauth_state_secret": "oauth-secret-with-at-least-32-characters",
        "google_client_id": "google-client",
        "google_client_secret": "google-secret",
        "google_redirect_uri": "https://syllo.kavinhq.com/api/auth/google/callback",
        "stripe_secret_key": "sk_live_example",
        "stripe_webhook_secret": "whsec_example",
        "stripe_price_scholar": "price_scholar",
        "stripe_price_deans_list": "price_deans",
        "gemini_api_key": "gemini-secret",
    }


def test_production_rejects_missing_secrets_without_echoing_values() -> None:
    values = production_values()
    values.pop("jwt_secret")
    with pytest.raises(ValidationError) as caught:
        Settings(**values, _env_file=None)
    assert "JWT_SECRET" in str(caught.value)
    assert "google-secret" not in str(caught.value)


def test_migration_failure_prevents_startup(monkeypatch) -> None:
    settings = Settings(**production_values(), _env_file=None)

    def fail(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("backend.app.startup.command.upgrade", fail)
    with pytest.raises(RuntimeError, match="database unavailable"):
        run_migrations(settings)


def test_production_migration_config_finds_packaged_scripts() -> None:
    settings = Settings(**production_values(), _env_file=None)
    scripts = ScriptDirectory.from_config(migration_config(settings))
    assert scripts.get_current_head() is not None


@pytest.mark.asyncio
async def test_disabled_bootstrap_creates_no_user_and_seed_route_is_absent(
    sql_app,
) -> None:
    app, factory = sql_app
    async with app.router.lifespan_context(app):
        pass
    async with factory() as session:
        count = await session.scalar(select(func.count()).select_from(User))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        seed = await client.post("/api/seed")
    assert count == 0
    assert seed.status_code == 404


@pytest.mark.asyncio
async def test_enabled_bootstrap_creates_only_configured_admin(sql_app) -> None:
    _, factory = sql_app
    settings = Settings(
        **production_values(),
        admin_bootstrap_enabled=True,
        admin_email="admin@syllo.example.com",
        admin_password="a-long-production-password",
        _env_file=None,
    )
    app = create_app(settings, session_factory=factory)
    async with app.router.lifespan_context(app):
        pass
    async with factory() as session:
        users = (await session.scalars(select(User))).all()
    assert len(users) == 1
    assert users[0].normalized_email == "admin@syllo.example.com"
    assert users[0].role == "admin"
