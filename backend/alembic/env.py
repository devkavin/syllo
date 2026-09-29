from __future__ import annotations

import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from backend.app.config import Settings
from backend.app.database import mysql_tls_connect_args
from backend.app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

if database_url := os.getenv("DATABASE_URL"):
    config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def configure_and_run(connection: Connection) -> None:
    context.configure(
        connection=connection, target_metadata=target_metadata, compare_type=True
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    database_url = config.get_main_option("sqlalchemy.url")
    allow_legacy_certificate = config.attributes.get("db_tls_allow_legacy_cert")
    if allow_legacy_certificate is None:
        allow_legacy_certificate = Settings().db_tls_allow_legacy_cert
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=mysql_tls_connect_args(
            database_url, allow_legacy_certificate
        ),
    )
    async with connectable.connect() as connection:
        await connection.run_sync(configure_and_run)
    await connectable.dispose()


def run_sync_migrations() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        configure_and_run(connection)


if context.is_offline_mode():
    run_migrations_offline()
elif "+asyncmy" in config.get_main_option(
    "sqlalchemy.url"
) or "+aiosqlite" in config.get_main_option("sqlalchemy.url"):
    asyncio.run(run_async_migrations())
else:
    run_sync_migrations()
