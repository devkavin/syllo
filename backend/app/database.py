from __future__ import annotations

import ssl
from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from backend.app.config import Settings


def mysql_tls_connect_args(
    database_url: str, allow_legacy_certificate: bool
) -> dict[str, object]:
    url = make_url(database_url)
    if url.drivername != "mysql+asyncmy" or not (ca_path := url.query.get("ssl_ca")):
        return {}

    context = ssl.create_default_context(cafile=ca_path)
    if allow_legacy_certificate:
        # Coolify's older generated database certificates can lack an Authority
        # Key Identifier. Keep CA and hostname checks, but allow that extension.
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return {"ssl": context}


def create_async_engine_from_settings(settings: Settings) -> AsyncEngine:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required to create a database engine")

    kwargs: dict[str, object] = {"pool_pre_ping": True}
    connect_args = mysql_tls_connect_args(
        settings.database_url, settings.db_tls_allow_legacy_cert
    )
    if connect_args:
        kwargs["connect_args"] = connect_args
    if not settings.database_url.startswith("sqlite+"):
        kwargs.update(
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_recycle=settings.db_pool_recycle,
        )
    return create_async_engine(settings.database_url, **kwargs)


def create_session_factory(
    engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory = request.app.state.session_factory
    if factory is None:
        raise RuntimeError("Database session factory is not configured")
    async with factory() as session:
        yield session
