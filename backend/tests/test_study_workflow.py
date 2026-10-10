from __future__ import annotations

import asyncio
from datetime import timedelta
from uuid import uuid4

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import event
from sqlalchemy.dialects import mysql
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from backend.app.config import Settings
from backend.app.main import create_app
from backend.app.models import Base, Notebook, Plan, StudyAttempt, base
from backend.tests.test_academic_crud import register


async def curriculum(client, count=3):
    subject = (await client.post("/api/subjects", json={"name": "Biology"})).json()
    unit = (
        await client.post(
            "/api/units", json={"subject_id": subject["subject_id"], "name": "Cells"}
        )
    ).json()
    lessons = [
        (
            await client.post(
                "/api/lessons", json={"unit_id": unit["unit_id"], "title": f"Cells {i}"}
            )
        ).json()
        for i in range(count)
    ]
    return subject, lessons


def test_attempt_ordering_preserves_mysql_subsecond_precision():
    # Otherwise MySQL truncates ratings within a second, and the random request
    # UUID can incorrectly decide which self-rating is shown as the last one.
    assert (
        StudyAttempt.__table__.c.created_at.type.compile(dialect=mysql.dialect())
        == "DATETIME(6)"
    )


@pytest_asyncio.fixture
async def concurrent_app(tmp_path, test_settings_values):
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{(tmp_path / 'concurrent.db').as_posix()}"
    )

    @event.listens_for(engine.sync_engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        session.add(
            Plan(plan_id="freshman", name="Freshman", price_cents=0, credits=10)
        )
        await session.commit()
    yield create_app(
        Settings(**test_settings_values, _env_file=None), session_factory=factory
    )
    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_notebook_saves_do_not_lose_updates_or_history(concurrent_app):
    transport = httpx.ASGITransport(app=concurrent_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as first, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as second:
        await register(first, "concurrent-notes@example.com")
        second.cookies.update(first.cookies)
        note = (
            await first.post(
                "/api/notebooks",
                json={"title": "Original", "content": "Preserve original"},
            )
        ).json()
        url = f"/api/notebooks/{note['notebook_id']}"
        results = await asyncio.gather(
            first.patch(url, json={"content": "First tab", "expected_revision": 1}),
            second.patch(url, json={"content": "Second tab", "expected_revision": 1}),
        )
        assert sorted(result.status_code for result in results) == [200, 409]
        saved = (await first.get(url)).json()
        assert saved["revision"] == 2 and saved["content"] in {
            "First tab",
            "Second tab",
        }
        history = (await first.get(url + "/history")).json()
        assert len(history) == 1 and history[0]["content"] == "Preserve original"


@pytest.mark.asyncio
async def test_concurrent_attempt_retries_count_once(concurrent_app):
    transport = httpx.ASGITransport(app=concurrent_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as first, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as second:
        await register(first, "concurrent-practice@example.com")
        second.cookies.update(first.cookies)
        item = (
            await first.post("/api/study/questions", json={"prompt": "What is recall?"})
        ).json()
        url = f"/api/study/questions/{item['question_id']}/attempt"
        payload = {
            "quality": "good",
            "expected_revision": 1,
            "request_id": str(uuid4()),
        }
        results = await asyncio.gather(
            first.post(url, json=payload), second.post(url, json=payload)
        )
        assert [result.status_code for result in results] == [200, 200]
        assert all(result.json()["attempts"] == 1 for result in results)
        assert (await first.get("/api/study/progress")).json()["attempts_count"] == 1
        # Distinct stale actions still conflict and do not add ledger entries.
        assert (
            await first.post(url, json={**payload, "request_id": str(uuid4())})
        ).status_code == 409


@pytest.mark.asyncio
async def test_concurrent_canonical_notebook_creation_returns_one_document(
    concurrent_app,
    monkeypatch,
):
    original_commit = AsyncSession.commit

    async def delayed_notebook_commit(session):
        if any(isinstance(item, Notebook) for item in session.new):
            # Exercise a second device opening the lesson while the first create
            # is still in flight, as happens with database/network latency.
            await asyncio.sleep(0.05)
        return await original_commit(session)

    monkeypatch.setattr(AsyncSession, "commit", delayed_notebook_commit)
    transport = httpx.ASGITransport(app=concurrent_app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as first, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as second:
        await register(first, "concurrent-canonical@example.com")
        second.cookies.update(first.cookies)
        _, lessons = await curriculum(first, 1)
        url = f"/api/lessons/{lessons[0]['lesson_id']}/notebook"
        results = await asyncio.gather(first.get(url), second.get(url))
        assert all(result.status_code == 200 for result in results)
        assert results[0].json()["notebook_id"] == results[1].json()["notebook_id"]
        assert len((await first.get("/api/notebooks")).json()) == 1


@pytest.mark.asyncio
async def test_notebook_conflicts_history_restore_and_trash(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "history-owner@example.com")
        await register(other, "history-other@example.com")
        note = (
            await owner.post(
                "/api/notebooks",
                json={"title": "Before", "content": "Literal <text>\n\nFinal"},
            )
        ).json()
        assert note["revision"] == 1
        url = f"/api/notebooks/{note['notebook_id']}"
        rich = [
            {
                "type": "paragraph",
                "content": [{"type": "text", "text": "Rich", "styles": {"bold": True}}],
            }
        ]
        saved = await owner.patch(
            url,
            json={
                "expected_revision": 1,
                "title": "After",
                "content": "Rich",
                "rich_content": rich,
            },
        )
        assert saved.status_code == 200
        assert saved.json()["revision"] == 2
        stale = await owner.patch(
            url, json={"expected_revision": 1, "content": "Lost update"}
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["current"]["rich_content"] == rich
        history = (await owner.get(url + "/history")).json()
        assert len(history) == 1 and history[0]["revision"] == 1
        assert history[0]["content"] == note["content"]
        restore_url = url + f"/history/{history[0]['version_id']}/restore"
        assert (await other.get(url + "/history")).status_code == 404
        assert (
            await other.post(restore_url, json={"expected_revision": 2})
        ).status_code == 404
        assert (
            await owner.post(restore_url, json={"expected_revision": 1})
        ).status_code == 409
        restored = (await owner.post(restore_url, json={"expected_revision": 2})).json()
        assert restored["revision"] == 3 and restored["content"] == note["content"]
        await owner.delete(url)
        assert (await owner.get(url)).status_code == 404
        assert (await owner.get("/api/notebooks")).json() == []
        assert (await owner.get("/api/search", params={"q": "Before"})).json()[
            "notebooks"
        ] == []
        trash = (await owner.get("/api/notebooks", params={"trash": "true"})).json()
        assert len(trash) == 1 and trash[0]["deleted_at"]
        assert (
            await other.get("/api/notebooks", params={"trash": "true"})
        ).json() == []
        assert (
            await owner.post(url + "/restore", json={"expected_revision": 3})
        ).status_code == 409
        alive = await owner.post(
            url + "/restore", json={"expected_revision": trash[0]["revision"]}
        )
        assert alive.status_code == 200 and alive.json()["deleted_at"] is None


@pytest.mark.asyncio
async def test_notebook_retains_latest_thirty_snapshots_and_legacy_patch(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "history-limit@example.com")
        note = (await client.post("/api/notebooks", json={"title": "History"})).json()
        url = f"/api/notebooks/{note['notebook_id']}"
        for i in range(33):
            assert (
                await client.patch(url, json={"content": str(i)})
            ).status_code == 200
        history = (await client.get(url + "/history")).json()
        assert len(history) == 30
        assert [v["revision"] for v in history] == list(range(33, 3, -1))


@pytest.mark.asyncio
async def test_lesson_notebook_is_canonical_and_preserves_literal_legacy_notes(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "canonical-owner@example.com")
        await register(other, "canonical-other@example.com")
        subject, lessons = await curriculum(owner, 1)
        lesson = lessons[0]
        literal = "<script>alert(1)</script>\n\n$math$ **text**"
        await owner.patch(
            f"/api/lessons/{lesson['lesson_id']}", json={"notes": literal}
        )
        url = f"/api/lessons/{lesson['lesson_id']}/notebook"
        note = (await owner.get(url)).json()
        assert note["title"] == lesson["title"] and note["content"] == literal
        assert (
            note["rich_content"] is None and note["subject_id"] == subject["subject_id"]
        )
        assert (await owner.get(url)).json()["notebook_id"] == note["notebook_id"]
        assert (await owner.get(f"/api/lessons/{lesson['lesson_id']}")).json()[
            "notes"
        ] == literal
        assert (await other.get(url)).status_code == 404
        await owner.delete(f"/api/notebooks/{note['notebook_id']}")
        assert (await owner.get(url)).status_code == 409


@pytest.mark.asyncio
async def test_question_attempts_are_idempotent_versioned_and_isolated(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "practice-owner@example.com")
        await register(other, "practice-other@example.com")
        subject, lessons = await curriculum(owner, 1)
        note = (
            await owner.post(
                "/api/notebooks",
                json={"title": "Cells", "lesson_id": lessons[0]["lesson_id"]},
            )
        ).json()
        created = await owner.post(
            "/api/study/questions",
            json={
                "notebook_id": note["notebook_id"],
                "kind": "question",
                "prompt": "What divides?",
                "answer": "Cells",
            },
        )
        assert created.status_code == 200
        question = created.json()
        assert (
            question["subject_id"] == subject["subject_id"]
            and question["lesson_id"] == lessons[0]["lesson_id"]
        )
        url = f"/api/study/questions/{question['question_id']}"
        assert (
            await other.patch(url, json={"expected_revision": 1, "prompt": "Foreign"})
        ).status_code == 404
        payload = {
            "quality": "good",
            "expected_revision": 1,
            "request_id": str(uuid4()),
        }
        rated = await owner.post(url + "/attempt", json=payload)
        assert rated.status_code == 200
        assert (
            rated.json()["attempts"] == 1
            and rated.json()["successes"] == 1
            and rated.json()["revision"] == 2
        )
        assert (await owner.post(url + "/attempt", json=payload)).json()[
            "attempts"
        ] == 1
        assert (
            await owner.post(url + "/attempt", json={**payload, "quality": "again"})
        ).status_code == 409
        assert (
            await owner.post(
                url + "/attempt", json={**payload, "request_id": str(uuid4())}
            )
        ).status_code == 409
        assert (
            await owner.patch(url, json={"expected_revision": 1, "prompt": "Stale"})
        ).status_code == 409
        assert (await other.post(url + "/attempt", json=payload)).status_code == 404
        assert (
            await owner.get("/api/study/questions", params={"due": "true"})
        ).json() == []
        patched = await owner.patch(
            url, json={"expected_revision": 2, "prompt": "How do cells divide?"}
        )
        assert patched.status_code == 200 and patched.json()["revision"] == 3
        progress = (await owner.get("/api/study/progress")).json()
        assert progress["attempts_count"] == 1 and progress["successful_attempts"] == 1
        assert progress["topics"][0]["title"] == lessons[0]["title"]
        assert (await other.get("/api/study/progress")).json()["attempts_count"] == 0
        assert (
            await other.post(
                "/api/study/questions",
                json={"notebook_id": note["notebook_id"], "prompt": "Foreign"},
            )
        ).status_code == 404
        await owner.delete(url)
        assert (await owner.get("/api/study/progress")).json()["attempts_count"] == 1


@pytest.mark.asyncio
async def test_mistake_queue_and_review_intervals(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "mistake-queue@example.com")
        made = await client.post(
            "/api/study/questions",
            json={
                "kind": "mistake",
                "prompt": "Explain mitosis",
                "mistake": "Wrong stage",
                "correction": "Prophase first",
            },
        )
        assert made.status_code == 200
        item = made.json()
        assert (
            len(
                (
                    await client.get(
                        "/api/study/questions",
                        params={"kind": "mistake", "due": "true"},
                    )
                ).json()
            )
            == 1
        )
        url = f"/api/study/questions/{item['question_id']}/attempt"
        for quality, expected_interval in [("again", 1), ("hard", 2), ("good", 4)]:
            response = await client.post(
                url,
                json={
                    "quality": quality,
                    "expected_revision": item["revision"],
                    "request_id": str(uuid4()),
                },
            )
            assert response.status_code == 200
            item = response.json()
            assert item["interval_days"] == expected_interval
        progress = (await client.get("/api/study/progress")).json()
        assert progress["mistakes_count"] == 1 and progress["questions_count"] == 0
        assert progress["attempts_count"] == 3 and progress["successful_attempts"] == 1
        assert item["correction"] == "Prophase first" and item["successes"] == 1


@pytest.mark.asyncio
async def test_revision_plan_capacity_existing_tasks_and_rescheduling(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "plan-owner@example.com")
        await register(other, "plan-other@example.com")
        subject, lessons = await curriculum(owner, 3)
        today = base.utc_now().date()
        ordinary = (
            await owner.post(
                "/api/tasks",
                json={"title": "Existing task", "due_date": today.isoformat()},
            )
        ).json()
        body = {
            "title": "Biology exam",
            "subject_id": subject["subject_id"],
            "exam_date": (today + timedelta(days=2)).isoformat(),
            "start_date": today.isoformat(),
            "study_days": list(range(7)),
            "daily_minutes": 60,
            "minutes_per_lesson": 30,
            "lesson_ids": [lesson["lesson_id"] for lesson in lessons],
        }
        made = await owner.post("/api/study/plans", json=body)
        assert made.status_code == 200
        plan = made.json()
        assert [item["due_date"] for item in plan["items"]] == [
            today.isoformat(),
            today.isoformat(),
            (today + timedelta(days=1)).isoformat(),
        ]
        tasks = (await owner.get("/api/tasks")).json()
        assert len(tasks) == 4 and ordinary["task_id"] in {
            task["task_id"] for task in tasks
        }
        agenda = await owner.get(
            "/api/agenda",
            params={
                "start": today.isoformat() + "T00:00:00Z",
                "end": (today + timedelta(days=2)).isoformat() + "T00:00:00Z",
            },
        )
        assert agenda.status_code == 200
        assert ordinary["task_id"] in {entry["id"] for entry in agenda.json()["items"]}
        assert (await other.get("/api/study/plans")).json() == []
        item = plan["items"][-1]
        item_url = f"/api/study/plans/{plan['plan_id']}/items/{item['task_id']}"
        assert (
            await other.patch(item_url, json={"completed": True})
        ).status_code == 404
        assert (
            await owner.patch(item_url, json={"due_date": today.isoformat()})
        ).status_code == 422
        assert (
            await owner.patch(item_url, json={"due_date": body["exam_date"]})
        ).status_code == 422
        assert (
            await owner.patch(
                f"/api/tasks/{item['task_id']}", json={"due_date": body["exam_date"]}
            )
        ).status_code == 422
        finished = await owner.patch(item_url, json={"completed": True})
        assert finished.status_code == 200 and finished.json()["completed"] is True
        assert (await owner.get("/api/study/plans")).json()[0]["items"][-1][
            "completed"
        ] is True
        assert (
            await owner.patch(
                f"/api/study/plans/{plan['plan_id']}/items/{ordinary['task_id']}",
                json={"completed": True},
            )
        ).status_code == 404
        assert (
            await other.delete(f"/api/study/plans/{plan['plan_id']}")
        ).status_code == 404
        assert (
            await owner.delete(f"/api/study/plans/{plan['plan_id']}")
        ).status_code == 200
        assert [task["task_id"] for task in (await owner.get("/api/tasks")).json()] == [
            ordinary["task_id"]
        ]


@pytest.mark.asyncio
async def test_revision_plan_rejects_impossible_invalid_and_foreign_schedules(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as owner, httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as other:
        await register(owner, "plan-validation@example.com")
        await register(other, "plan-validation-other@example.com")
        subject, lessons = await curriculum(owner, 3)
        today = base.utc_now().date()
        body = {
            "title": "Exam",
            "subject_id": subject["subject_id"],
            "exam_date": (today + timedelta(days=1)).isoformat(),
            "study_days": list(range(7)),
            "daily_minutes": 30,
            "lesson_ids": [lesson["lesson_id"] for lesson in lessons],
        }
        assert (await owner.post("/api/study/plans", json=body)).status_code == 422
        for patch in (
            {"study_days": []},
            {"study_days": [7]},
            {"daily_minutes": 0},
            {"lesson_ids": []},
            {"lesson_ids": [lessons[0]["lesson_id"]] * 2},
            {"start_date": (today - timedelta(days=1)).isoformat()},
            {"exam_date": today.isoformat()},
        ):
            assert (
                await owner.post("/api/study/plans", json={**body, **patch})
            ).status_code == 422
        assert (await other.post("/api/study/plans", json=body)).status_code == 404
        assert (await owner.get("/api/tasks")).json() == []
