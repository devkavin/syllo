from __future__ import annotations

from collections.abc import AsyncIterator

import httpx
import pytest
import pytest_asyncio
from jose import JWTError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Base, Plan
from backend.app.security import TokenService


@pytest_asyncio.fixture
async def auth_client(
    test_settings_values: dict[str, object],
) -> AsyncIterator[tuple[httpx.AsyncClient, async_sessionmaker, Settings]]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add(
            Plan(plan_id="freshman", name="Freshman", price_cents=0, credits=10)
        )
        await session.commit()

    settings = Settings(
        **{**test_settings_values, "cookie_secure": True}, _env_file=None
    )
    app = create_app(settings, session_factory=factory)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="https://testserver"
    ) as client:
        yield client, factory, settings
    await engine.dispose()


def test_access_and_refresh_tokens_cannot_be_interchanged(
    test_settings_values: dict[str, object],
) -> None:
    service = TokenService(Settings(**test_settings_values, _env_file=None))
    pair = service.issue_pair("user-1")

    assert service.decode(pair.access_token, "access")["sub"] == "user-1"
    assert service.decode(pair.refresh_token, "refresh")["sub"] == "user-1"
    with pytest.raises(JWTError):
        service.decode(pair.refresh_token, "access")
    with pytest.raises(JWTError):
        service.decode(pair.access_token, "refresh")


@pytest.mark.asyncio
async def test_register_normalizes_email_and_rejects_duplicate(auth_client) -> None:
    client, _, _ = auth_client
    first = await client.post(
        "/api/auth/register",
        json={
            "email": " Student@Example.COM ",
            "password": "study-pass",
            "name": " Student ",
        },
    )
    duplicate = await client.post(
        "/api/auth/register",
        json={
            "email": "student@example.com",
            "password": "study-pass",
            "name": "Other",
        },
    )

    assert first.status_code == 200
    assert first.json()["email"] == "student@example.com"
    assert first.json()["name"] == "Student"
    assert "password_hash" not in first.json()
    assert duplicate.status_code == 400


@pytest.mark.asyncio
async def test_login_sets_hardened_cookies_and_rejects_bad_password(
    auth_client,
) -> None:
    client, _, _ = auth_client
    await client.post(
        "/api/auth/register",
        json={
            "email": "student@example.com",
            "password": "study-pass",
            "name": "Student",
        },
    )
    client.cookies.clear()

    bad = await client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "wrong-pass"},
    )
    good = await client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "study-pass"},
    )

    assert bad.status_code == 401
    assert good.status_code == 200
    cookies = good.headers.get_list("set-cookie")
    assert len(cookies) == 2
    assert all("HttpOnly" in cookie for cookie in cookies)
    assert all("Secure" in cookie for cookie in cookies)
    assert all("SameSite=lax" in cookie for cookie in cookies)


@pytest.mark.asyncio
async def test_bearer_auth_and_profile_patch(auth_client) -> None:
    client, _, _ = auth_client
    registered = await client.post(
        "/api/auth/register",
        json={
            "email": "mobile@example.com",
            "password": "study-pass",
            "name": "Mobile",
        },
    )
    access_token = registered.json()["access_token"]
    client.cookies.clear()

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    patched = await client.patch(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"name": "Mobile Student", "onboarded": True, "daily_goal_minutes": 90},
    )

    assert me.status_code == 200
    assert me.json()["email"] == "mobile@example.com"
    assert patched.status_code == 200
    assert patched.json()["name"] == "Mobile Student"
    assert patched.json()["onboarded"] is True
    assert patched.json()["daily_goal_minutes"] == 90


@pytest.mark.asyncio
async def test_refresh_token_is_rejected_as_bearer(auth_client) -> None:
    client, _, _ = auth_client
    registered = await client.post(
        "/api/auth/register",
        json={
            "email": "student@example.com",
            "password": "study-pass",
            "name": "Student",
        },
    )
    client.cookies.clear()
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {registered.json()['refresh_token']}"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_logout_clears_both_cookies(auth_client) -> None:
    client, _, _ = auth_client
    await client.post(
        "/api/auth/register",
        json={
            "email": "student@example.com",
            "password": "study-pass",
            "name": "Student",
        },
    )
    response = await client.post("/api/auth/logout")
    cookies = response.headers.get_list("set-cookie")
    assert response.json() == {"ok": True}
    assert len(cookies) == 2
    assert all("Max-Age=0" in cookie for cookie in cookies)
