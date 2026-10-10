from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from backend.app.models import User


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
        "circles", "circle_members", "circle_goals",
        "paddle_accounts", "paddle_payments", "paddle_events",
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
        "thinking_tokens", "cached_input_tokens", "total_tokens", "finish_reason", "plan_id",
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


def test_rich_notebook_migration_preserves_existing_notes(tmp_path: Path) -> None:
    database_path = tmp_path / "notebook-upgrade.db"
    config = Config(str(Path("backend/alembic.ini").resolve()))
    config.set_main_option("script_location", str(Path("backend/alembic").resolve()))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    command.upgrade(config, "20261005_0009")
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(user_id="legacy-owner", email="legacy@example.com", normalized_email="legacy@example.com", name="Legacy"))
        connection.execute(text("INSERT INTO notebooks (notebook_id, user_id, title, content, created_at, updated_at) VALUES ('legacy-note', 'legacy-owner', 'Legacy title', :content, '2026-10-01 00:00:00', '2026-10-02 00:00:00')"), {"content": "Literal <text>\n\nLast line"})
    command.upgrade(config, "head")
    with engine.connect() as connection:
        note = connection.execute(text("SELECT content, rich_content, paper_style, font_style, user_id FROM notebooks")).one()
        assert tuple(note) == ("Literal <text>\n\nLast line", None, "plain", "sans", "legacy-owner")
    command.downgrade(config, "20261005_0009")
    assert {column["name"] for column in inspect(engine).get_columns("notebooks")}.isdisjoint({"rich_content", "paper_style", "font_style"})
    with engine.connect() as connection:
        assert connection.execute(text("SELECT title, content, user_id FROM notebooks")).one() == ("Legacy title", "Literal <text>\n\nLast line", "legacy-owner")
    command.upgrade(config, "head")
    command.check(config)
    engine.dispose()


def test_focus_timer_migration_is_additive_and_preserves_study_logs(tmp_path: Path) -> None:
    database_path = tmp_path / "focus-timer.db"
    config = Config(str(Path("backend/alembic.ini").resolve()))
    config.set_main_option("script_location", str(Path("backend/alembic").resolve()))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    command.upgrade(config, "20261010_0010")
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(user_id="timer-migration-owner", email="timer-migration@example.com", normalized_email="timer-migration@example.com", name="Timer"))
        connection.execute(text("INSERT INTO study_sessions (session_id, user_id, duration_seconds, mode, note, started_at, created_at, updated_at) VALUES ('old-study', 'timer-migration-owner', 120, 'pomodoro', '', '2026-10-01 08:00:00', '2026-10-01 08:00:00', '2026-10-01 08:00:00')"))
    command.upgrade(config, "head")
    assert {"focus_timers", "focus_timer_requests"}.issubset(inspect(engine).get_table_names())
    command.check(config)
    with engine.connect() as connection:
        assert connection.execute(text("SELECT duration_seconds FROM study_sessions WHERE session_id = 'old-study'")).scalar_one() == 120
    command.downgrade(config, "20261010_0010")
    assert "focus_timers" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT duration_seconds FROM study_sessions WHERE session_id = 'old-study'")).scalar_one() == 120
    engine.dispose()


def test_study_workflow_migration_preserves_notes_tasks_and_timer(tmp_path: Path) -> None:
    database_path = tmp_path / "study-workflow.db"
    config = Config(str(Path("backend/alembic.ini").resolve()))
    config.set_main_option("script_location", str(Path("backend/alembic").resolve()))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{database_path.as_posix()}")
    command.upgrade(config, "20261010_0011")
    engine = create_engine(f"sqlite:///{database_path.as_posix()}")
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(user_id="workflow-owner", email="workflow@example.com", normalized_email="workflow@example.com", name="Workflow"))
        connection.execute(text("INSERT INTO notebooks (notebook_id, user_id, title, content, rich_content, created_at, updated_at) VALUES ('old-note', 'workflow-owner', 'Keep', :content, :rich, '2026-10-01', '2026-10-01')"), {"content": "Literal <notes>\n\nEnd", "rich": '[{"type":"paragraph","content":"Rich"}]'})
        connection.execute(text("INSERT INTO tasks (task_id, user_id, title, priority, notes, completed, created_at, updated_at) VALUES ('old-task', 'workflow-owner', 'Existing Today work', 'normal', '', 0, '2026-10-01', '2026-10-01')"))
        connection.execute(text("INSERT INTO focus_timers (user_id, revision, timer, created_at, updated_at) VALUES ('workflow-owner', 5, :timer, '2026-10-01', '2026-10-01')"), {"timer": '{"timer_id":"keep-timer","status":"paused"}'})
    command.upgrade(config, "head")
    assert {"notebook_versions", "study_questions", "study_attempts", "revision_plans", "revision_plan_items"}.issubset(inspect(engine).get_table_names())
    with engine.connect() as connection:
        assert connection.execute(text("SELECT content, rich_content, revision, deleted_at FROM notebooks")).one() == ('Literal <notes>\n\nEnd', '[{"type":"paragraph","content":"Rich"}]', 1, None)
        assert connection.execute(text("SELECT title FROM tasks")).scalar_one() == "Existing Today work"
        assert connection.execute(text("SELECT revision, timer FROM focus_timers")).one() == (5, '{"timer_id":"keep-timer","status":"paused"}')
    command.check(config)
    command.downgrade(config, "20261010_0011")
    assert "study_attempts" not in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert connection.execute(text("SELECT content FROM notebooks")).scalar_one() == "Literal <notes>\n\nEnd"
        assert connection.execute(text("SELECT COUNT(*) FROM tasks")).scalar_one() == 1
    engine.dispose()
