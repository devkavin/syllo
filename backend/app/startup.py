from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config

from backend.app.config import Settings, get_settings


def migration_config(settings: Settings) -> Config:
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required before migrations can run")
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "alembic"))
    config.set_main_option("sqlalchemy.url", settings.database_url.replace("%", "%%"))
    return config


def run_migrations(settings: Settings) -> None:
    command.upgrade(migration_config(settings), "head")


def main() -> None:
    run_migrations(get_settings())


if __name__ == "__main__":
    main()
