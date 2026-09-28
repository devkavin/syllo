from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.app.config import Settings
from backend.app.models import Base, Plan, Subject, User
from backend.app.security import hash_password, verify_password
from backend.app.services.admin_bootstrap import ensure_admin


@pytest.fixture
def admin_values(test_settings_values: dict[str, object]) -> dict[str, object]:
    return {
        **test_settings_values,
        "admin_bootstrap_enabled": True,
        "admin_email": "Admin@Example.com",
        "admin_password": "initial-admin-password",
    }


@pytest.mark.asyncio
async def test_bootstrap_is_disabled_by_default(test_settings_values) -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    result = await ensure_admin(None, Settings(**test_settings_values, _env_file=None))
    assert result.status == "disabled"
    await engine.dispose()


@pytest.mark.asyncio
async def test_enabled_bootstrap_requires_both_credentials(
    test_settings_values,
) -> None:
    settings = Settings(
        **test_settings_values,
        admin_bootstrap_enabled=True,
        _env_file=None,
    )
    with pytest.raises(RuntimeError, match="ADMIN_EMAIL and ADMIN_PASSWORD"):
        await ensure_admin(None, settings)


@pytest.mark.asyncio
async def test_bootstrap_creates_only_admin_and_is_idempotent(admin_values) -> None:
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
        settings = Settings(**admin_values, _env_file=None)
        created = await ensure_admin(session, settings)
        again = await ensure_admin(session, settings)

        users = (await session.scalars(select(User))).all()
        subjects = (await session.scalars(select(Subject))).all()

    assert created.status == "created"
    assert again.status == "existing_admin"
    assert len(users) == 1
    assert users[0].normalized_email == "admin@example.com"
    assert users[0].role == "admin"
    assert verify_password("initial-admin-password", users[0].password_hash)
    assert subjects == []
    await engine.dispose()


@pytest.mark.asyncio
async def test_bootstrap_refuses_to_promote_or_reset_existing_user(
    admin_values,
) -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    original_hash = hash_password("original-password")
    async with factory() as session:
        session.add_all(
            [
                Plan(plan_id="freshman", name="Freshman", price_cents=0, credits=10),
                User(
                    email="admin@example.com",
                    normalized_email="admin@example.com",
                    name="Existing",
                    password_hash=original_hash,
                    role="user",
                ),
            ]
        )
        await session.commit()
        result = await ensure_admin(session, Settings(**admin_values, _env_file=None))
        user = await session.scalar(
            select(User).where(User.normalized_email == "admin@example.com")
        )

    assert result.status == "conflict"
    assert user.role == "user"
    assert user.password_hash == original_hash
    await engine.dispose()
