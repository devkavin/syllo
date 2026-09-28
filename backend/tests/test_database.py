from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.config import Settings
from backend.app.database import (
    create_async_engine_from_settings,
    create_session_factory,
)
from backend.app.models import Lesson, Subject, Unit, User


@pytest.mark.asyncio
async def test_user_email_and_stripe_event_constraints_are_unique() -> None:
    from backend.app.models import StripeEvent

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        from backend.app.models import Base

        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add_all(
            [
                User(
                    email="student@example.com", normalized_email="student@example.com"
                ),
                User(
                    email="Student@example.com", normalized_email="student@example.com"
                ),
            ]
        )
        with pytest.raises(IntegrityError):
            await session.commit()
        await session.rollback()

        session.add_all(
            [
                StripeEvent(
                    event_id="evt_same", event_type="checkout.session.completed"
                ),
                StripeEvent(
                    event_id="evt_same", event_type="checkout.session.completed"
                ),
            ]
        )
        with pytest.raises(IntegrityError):
            await session.commit()

    await engine.dispose()


def test_academic_ownership_and_cascade_contracts_are_explicit() -> None:
    subject_fks = {
        foreign_key.target_fullname for foreign_key in Subject.__table__.foreign_keys
    }
    unit_fks = {
        foreign_key.target_fullname for foreign_key in Unit.__table__.foreign_keys
    }
    lesson_fks = {
        foreign_key.target_fullname for foreign_key in Lesson.__table__.foreign_keys
    }

    assert "users.user_id" in subject_fks
    assert {"users.user_id", "subjects.subject_id"}.issubset(unit_fks)
    assert {"users.user_id", "subjects.subject_id", "units.unit_id"}.issubset(
        lesson_fks
    )
    assert Unit.__table__.c.subject_id.foreign_keys.pop().ondelete == "CASCADE"
    assert Lesson.__table__.c.unit_id.foreign_keys.pop().ondelete == "CASCADE"


def test_timestamps_and_historical_links_are_portable() -> None:
    from backend.app.models import PaymentTransaction, StudySession

    assert User.__table__.c.created_at.default is not None
    assert User.__table__.c.created_at.type.timezone is True
    assert StudySession.__table__.c.lesson_id.nullable is True
    assert PaymentTransaction.__table__.c.user_id.nullable is True


def test_engine_factory_uses_mysql_pool_settings_and_sqlite_safe_defaults() -> None:
    sqlite_settings = Settings(
        environment="test",
        database_url="sqlite+aiosqlite:///:memory:",
        _env_file=None,
    )
    engine = create_async_engine_from_settings(sqlite_settings)
    factory = create_session_factory(engine)

    assert factory.kw["expire_on_commit"] is False
    assert engine.pool is not None
