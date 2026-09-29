from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


def test_initial_migration_round_trip_on_empty_database(tmp_path: Path) -> None:
    database_path = tmp_path / "syllo.db"
    config = Config(str(Path("backend/alembic.ini").resolve()))
    config.set_main_option("script_location", str(Path("backend/alembic").resolve()))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")

    command.upgrade(config, "head")
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    tables = set(inspect(engine).get_table_names())
    assert {
        "users",
        "subjects",
        "units",
        "lessons",
        "study_sessions",
        "plans",
        "stripe_events",
        "oauth_login_codes",
    }.issubset(tables)
    assert (
        engine.connect().exec_driver_sql("SELECT COUNT(*) FROM users").scalar_one() == 0
    )
    assert (
        engine.connect().exec_driver_sql("SELECT COUNT(*) FROM plans").scalar_one() == 3
    )
    rows = (
        engine.connect()
        .exec_driver_sql("SELECT plan_id, price_cents, credits FROM plans")
        .all()
    )
    plan_rows = {row[0]: (row[1], row[2]) for row in rows}
    assert plan_rows == {
        "freshman": (0, 10),
        "scholar": (899, 250),
        "deans_list": (1399, 800),
    }
    usage_columns = {column["name"] for column in inspect(engine).get_columns("ai_usage_logs")}
    assert {
        "model",
        "input_tokens",
        "output_tokens",
        "estimated_cost_microusd",
        "latency_ms",
        "error_code",
    }.issubset(usage_columns)
    assert "bonus_credits_remaining" in {
        column["name"] for column in inspect(engine).get_columns("users")
    }
    command.check(config)

    command.downgrade(config, "base")
    assert inspect(engine).get_table_names() == ["alembic_version"]

    command.upgrade(config, "head")
    assert "users" in inspect(engine).get_table_names()
    engine.dispose()
