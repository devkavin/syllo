from __future__ import annotations

import ssl
from unittest.mock import patch

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app import database
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


def test_coolify_legacy_tls_keeps_ca_and_hostname_verification(tmp_path) -> None:
    ca_file = tmp_path / "coolify-ca.crt"
    ca_file.write_text("test-ca-placeholder", encoding="utf-8")
    database_url = (
        "mysql+asyncmy://user:pass@database:3306/syllo"
        f"?ssl_ca={ca_file.as_posix()}"
    )

    def fake_default_context(*, cafile):
        assert cafile == ca_file.as_posix()
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.verify_flags |= ssl.VERIFY_X509_STRICT
        return context

    with patch("ssl.create_default_context", fake_default_context):
        ssl_context = database.mysql_tls_connect_args(
            database_url, allow_legacy_certificate=True
        )["ssl"]

    assert ssl_context.verify_mode == ssl.CERT_REQUIRED
    assert ssl_context.check_hostname is True
    assert not (ssl_context.verify_flags & ssl.VERIFY_X509_STRICT)


def test_mysql_tls_stays_strict_without_explicit_legacy_opt_in(tmp_path) -> None:
    ca_file = tmp_path / "coolify-ca.crt"
    ca_file.write_text("test-ca-placeholder", encoding="utf-8")
    database_url = (
        "mysql+asyncmy://user:pass@database:3306/syllo"
        f"?ssl_ca={ca_file.as_posix()}"
    )

    def fake_default_context(*, cafile):
        assert cafile == ca_file.as_posix()
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.verify_flags |= ssl.VERIFY_X509_STRICT
        return context

    with patch("ssl.create_default_context", fake_default_context):
        ssl_context = database.mysql_tls_connect_args(
            database_url, allow_legacy_certificate=False
        )["ssl"]

    assert ssl_context.verify_flags & ssl.VERIFY_X509_STRICT
    assert database.mysql_tls_connect_args("sqlite+aiosqlite:///:memory:", True) == {}


def test_runtime_mysql_engine_receives_verified_legacy_tls_context(monkeypatch) -> None:
    settings = Settings(
        environment="test",
        database_url=(
            "mysql+asyncmy://user:pass@database:3306/syllo"
            "?ssl_ca=/etc/ssl/certs/coolify-ca.crt"
        ),
        db_tls_allow_legacy_cert=True,
        _env_file=None,
    )
    captured = {}
    sentinel_engine = object()

    def fake_default_context(*, cafile):
        assert cafile == "/etc/ssl/certs/coolify-ca.crt"
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.verify_flags |= ssl.VERIFY_X509_STRICT
        return context

    def fake_create_engine(url, **kwargs):
        captured.update(url=url, **kwargs)
        return sentinel_engine

    monkeypatch.setattr(database, "create_async_engine", fake_create_engine)
    with patch("ssl.create_default_context", fake_default_context):
        result = create_async_engine_from_settings(settings)

    assert result is sentinel_engine
    assert captured["connect_args"]["ssl"].check_hostname is True
    assert captured["connect_args"]["ssl"].verify_mode == ssl.CERT_REQUIRED
    assert not (
        captured["connect_args"]["ssl"].verify_flags & ssl.VERIFY_X509_STRICT
    )
