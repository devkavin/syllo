from datetime import datetime, timedelta, timezone
from uuid import uuid4

import httpx
import pytest

from backend.app.models import base
from backend.tests.test_student_launch import person, headers
from backend.tests.test_today_search_reviews import make_lesson


@pytest.fixture
def server_clock(monkeypatch):
    now = [datetime(2026, 10, 10, 8, 0, 0, 123456, tzinfo=timezone.utc)]
    monkeypatch.setattr(base, "utc_now", lambda: now[0])
    return now


def action(name, revision, **values):
    return {"action": name, "expected_revision": revision, "request_id": str(uuid4()), **values}


@pytest.mark.asyncio
async def test_timer_is_shared_across_devices_and_excludes_paused_fractional_time(sql_app, server_clock):
    app, factory = sql_app
    user = await person(factory, "timer-shared@example.com")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, user)) as phone, httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, user)) as pc:
        subject, unit, lesson = await make_lesson(phone)
        initial = await phone.get("/api/focus-timer")
        assert initial.status_code == 200
        assert initial.json()["timer"] is None and initial.json()["revision"] == 0
        started = await phone.post("/api/focus-timer/action", json=action("start", 0, mode="pomodoro", duration_seconds=1500, lesson_id=lesson["lesson_id"]))
        assert started.status_code == 200
        timer = started.json()["timer"]
        assert timer["subject_id"] == subject["subject_id"] and timer["unit_id"] == unit["unit_id"]
        assert timer["lesson_title"] == "Limits"
        assert (await pc.get("/api/focus-timer")).json()["timer"]["timer_id"] == timer["timer_id"]
        server_clock[0] += timedelta(seconds=7.75)
        paused = await pc.post("/api/focus-timer/action", json=action("pause", 1))
        assert paused.status_code == 200
        assert paused.json()["timer"]["elapsed_seconds"] == pytest.approx(7.75)
        server_clock[0] += timedelta(hours=2)
        assert (await phone.get("/api/focus-timer")).json()["timer"]["elapsed_seconds"] == pytest.approx(7.75)
        resumed = await phone.post("/api/focus-timer/action", json=action("resume", 2))
        assert resumed.status_code == 200
        server_clock[0] += timedelta(seconds=4.5)
        finish_body = action("finish", 3)
        finished = await pc.post("/api/focus-timer/action", json=finish_body)
        assert finished.status_code == 200
        data = finished.json()
        assert data["timer"] is None and data["revision"] == 4
        assert data["completed_timer_id"] == timer["timer_id"]
        assert data["finished_duration_seconds"] == 12
        assert data["last_session"]["duration_seconds"] == 12
        assert (await phone.post("/api/focus-timer/action", json=finish_body)).json()["last_session"]["session_id"] == data["last_session"]["session_id"]
        assert len((await pc.get("/api/sessions")).json()) == 1
        assert (await pc.get(f"/api/lessons/{lesson['lesson_id']}")).json()["total_seconds"] == 12


@pytest.mark.asyncio
async def test_timer_countdown_expires_without_browser_and_records_once(sql_app, server_clock):
    app, factory = sql_app
    user = await person(factory, "timer-expiry@example.com")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver", headers=headers(app, user)) as client:
        started = await client.post("/api/focus-timer/action", json=action("start", 0, mode="pomodoro", duration_seconds=30))
        assert started.status_code == 200
        server_clock[0] += timedelta(days=2)
        expired = await client.get("/api/focus-timer")
        assert expired.status_code == 200
        assert expired.json()["timer"] is None
        assert expired.json()["last_session"]["duration_seconds"] == 30
        assert expired.json()["revision"] == 2
        assert expired.json()["last_session"]["finished_at"] == (datetime.fromisoformat(started.json()["timer"]["started_at"]) + timedelta(seconds=30)).replace(microsecond=0).isoformat()
        await client.get("/api/focus-timer")
        assert len((await client.get("/api/sessions")).json()) == 1
        assert (await client.post("/api/focus-timer/action", json=action("start", 2, mode="short", duration_seconds=60))).status_code == 200
        server_clock[0] += timedelta(minutes=5)
        assert (await client.get("/api/focus-timer")).json()["timer"] is None
        assert len((await client.get("/api/sessions")).json()) == 1


@pytest.mark.asyncio
async def test_timer_stale_actions_idempotency_clock_rejection_and_ownership(sql_app, server_clock):
    app, factory = sql_app
    owner = await person(factory, "timer-owner@example.com")
    other = await person(factory, "timer-other@example.com")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, owner)) as client, httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, other)) as stranger:
        _, _, foreign_lesson = await make_lesson(stranger)
        assert (await client.post("/api/focus-timer/action", json=action("start", 0, mode="stopwatch", lesson_id=foreign_lesson["lesson_id"]))).status_code == 404
        assert (await client.post("/api/focus-timer/action", json=action("start", 0, mode="stopwatch", elapsed_seconds=500))).status_code == 422
        assert (await client.post("/api/focus-timer/action", json=action("start", 0, mode="stopwatch", started_at="2000-01-01T00:00:00Z"))).status_code == 422
        body = action("start", 0, mode="stopwatch")
        start = await client.post("/api/focus-timer/action", json=body)
        assert start.status_code == 200
        assert (await client.post("/api/focus-timer/action", json=body)).json()["revision"] == 1
        assert (await client.post("/api/focus-timer/action", json={**body, "mode": "pomodoro"})).status_code == 409
        assert (await client.post("/api/focus-timer/action", json=action("pause", 0))).status_code == 409
        assert (await stranger.get("/api/focus-timer")).json()["timer"] is None
        short = await client.post("/api/focus-timer/action", json=action("finish", 1))
        assert short.status_code == 422 and "10" in short.json()["detail"]
        assert (await client.get("/api/focus-timer")).json()["revision"] == 1
        reset = await client.post("/api/focus-timer/action", json=action("reset", 1))
        assert reset.status_code == 200 and reset.json()["revision"] == 2
        assert reset.json()["completed_timer_id"] is None


@pytest.mark.asyncio
async def test_stopwatch_preserves_more_than_one_day_of_study(sql_app, server_clock):
    app, factory = sql_app
    user = await person(factory, "timer-long@example.com")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver", headers=headers(app, user)) as client:
        start = await client.post("/api/focus-timer/action", json=action("start", 0, mode="stopwatch"))
        assert start.status_code == 200
        server_clock[0] += timedelta(seconds=86415.9)
        assert (await client.get("/api/focus-timer")).json()["timer"]["elapsed_seconds"] == pytest.approx(86415.9)
        completed = await client.post("/api/focus-timer/action", json=action("finish", 1))
        assert completed.status_code == 200
        assert completed.json()["finished_duration_seconds"] == 86415
        sessions = (await client.get("/api/sessions")).json()
        assert sorted(item["duration_seconds"] for item in sessions) == [15, 86400]
        assert (await client.get("/api/analytics")).json()["total_seconds"] == 86415


@pytest.mark.asyncio
async def test_failed_completion_rolls_back_log_and_timer_together(sql_app, server_clock, monkeypatch):
    from backend.app.api.routes import focus_timer

    app, factory = sql_app
    user = await person(factory, "timer-atomic@example.com")
    original = focus_timer.record_study_session

    async def fail_after_recording(*args, **kwargs):
        await original(*args, **kwargs)
        raise RuntimeError("Simulated failure before timer completion")

    transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver", headers=headers(app, user)) as client:
        assert (await client.post("/api/focus-timer/action", json=action("start", 0, mode="stopwatch"))).status_code == 200
        server_clock[0] += timedelta(seconds=12)
        finish = action("finish", 1)
        monkeypatch.setattr(focus_timer, "record_study_session", fail_after_recording)
        assert (await client.post("/api/focus-timer/action", json=finish)).status_code == 500
        snapshot = (await client.get("/api/focus-timer")).json()
        assert snapshot["revision"] == 1 and snapshot["timer"]["elapsed_seconds"] == 12
        assert (await client.get("/api/sessions")).json() == []
        assert (await client.get("/api/analytics")).json()["total_seconds"] == 0
        monkeypatch.setattr(focus_timer, "record_study_session", original)
        assert (await client.post("/api/focus-timer/action", json=finish)).status_code == 200
        assert (await client.post("/api/focus-timer/action", json=finish)).status_code == 200
        assert len((await client.get("/api/sessions")).json()) == 1
