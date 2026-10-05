from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest

from backend.tests.test_academic_crud import register
from backend.tests.test_today_search_reviews import make_lesson
from backend.app.models import StudySession


@pytest.mark.asyncio
async def test_session_retry_records_time_once_and_conflicts_on_changed_payload(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "study@example.com")
        _, _, lesson = await make_lesson(client)
        body = {"lesson_id": lesson["lesson_id"], "request_id": str(uuid4()), "duration_seconds": 2700, "started_at": datetime.now(timezone.utc).isoformat()}
        first = await client.post("/api/sessions", json=body)
        second = await client.post("/api/sessions", json=body)
        assert first.status_code == second.status_code == 200
        assert first.json()["session_id"] == second.json()["session_id"]
        assert (await client.get("/api/analytics")).json()["total_seconds"] == 2700
        assert (await client.post("/api/sessions", json={**body, "duration_seconds": 1800})).status_code == 409


@pytest.mark.asyncio
async def test_review_upsert_is_owned_unique_and_note_does_not_change_lesson(sql_app):
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        await register(client, "notes@example.com")
        _, _, lesson = await make_lesson(client)
        lid = lesson["lesson_id"]
        await client.patch(f"/api/lessons/{lid}", json={"notes": "Original notes"})
        saved = (await client.post("/api/sessions", json={"lesson_id": lid, "duration_seconds": 60, "started_at": datetime.now(timezone.utc).isoformat()})).json()
        changed = await client.patch(f"/api/sessions/{saved['session_id']}", json={"note": "Understood limits"})
        assert changed.status_code == 200
        assert changed.json()["note"] == "Understood limits"
        assert (await client.get(f"/api/lessons/{lid}")).json()["notes"] == "Original notes"
        for minutes in (30, 60):
            due = datetime.now(timezone.utc) + timedelta(minutes=minutes)
            response = await client.put(f"/api/lessons/{lid}/review", json={"next_review_at": due.isoformat()})
            assert response.status_code == 200
        assert len((await client.get("/api/reviews")).json()) == 1
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as other:
            await register(other, "other-notes@example.com")
            assert (await other.put(f"/api/lessons/{lid}/review", json={"next_review_at": due.isoformat()})).status_code == 404
            assert (await other.patch(f"/api/sessions/{saved['session_id']}", json={"note": "Bad"})).status_code == 404


@pytest.mark.asyncio
async def test_session_retry_survives_mysql_second_precision(sql_app):
    app, factory = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "precision@example.com")
        body = {"request_id": str(uuid4()), "duration_seconds": 60, "started_at": datetime.now(timezone.utc).replace(microsecond=123000).isoformat()}
        first = await client.post("/api/sessions", json=body)
        assert first.status_code == 200
        # Reproduce DATETIME(0) persistence without claiming a live MySQL check.
        async with factory() as s:
            saved = await s.get(StudySession, first.json()["session_id"])
            saved.started_at = saved.started_at.replace(microsecond=0)
            await s.commit()
        second = await client.post("/api/sessions", json=body)
        assert second.status_code == 200
        assert second.json()["session_id"] == first.json()["session_id"]
        changed = {**body, "started_at": (datetime.fromisoformat(body["started_at"]) + timedelta(seconds=1)).isoformat()}
        assert (await client.post("/api/sessions", json=changed)).status_code == 409
