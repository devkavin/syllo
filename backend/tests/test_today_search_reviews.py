from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from backend.app.models import Review

from backend.tests.test_academic_crud import register


async def make_lesson(client: httpx.AsyncClient, subject_name: str = "Mathematics"):
    subject = (await client.post("/api/subjects", json={"name": subject_name})).json()
    unit = (
        await client.post(
            "/api/units", json={"subject_id": subject["subject_id"], "name": "Calculus"}
        )
    ).json()
    lesson = (
        await client.post(
            "/api/lessons", json={"unit_id": unit["unit_id"], "title": "Limits"}
        )
    ).json()
    return subject, unit, lesson


@pytest.mark.asyncio
async def test_recording_session_updates_lesson_streak_and_review_atomically(
    sql_app,
) -> None:
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        subject, _, lesson = await make_lesson(client)
        started = datetime.now(timezone.utc).isoformat()
        response = await client.post(
            "/api/sessions",
            json={
                "subject_id": subject["subject_id"],
                "lesson_id": lesson["lesson_id"],
                "duration_seconds": 2700,
                "mode": "pomodoro",
                "started_at": started,
            },
        )

        assert response.status_code == 200
        saved_lesson = (await client.get(f"/api/lessons/{lesson['lesson_id']}")).json()
        today = (await client.get("/api/today")).json()
        reviews = (await client.get("/api/reviews")).json()
        assert saved_lesson["total_seconds"] == 2700
        assert saved_lesson["status"] == "in_progress"
        assert today["seconds_today"] == 2700
        assert today["streak"]["current"] == 1
        assert len(reviews) == 1
        assert reviews[0]["lesson_title"] == "Limits"


@pytest.mark.asyncio
async def test_reviews_advance_reset_and_expose_due_state(sql_app) -> None:
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        _, _, lesson = await make_lesson(client)
        await client.patch(
            f"/api/lessons/{lesson['lesson_id']}", json={"status": "done"}
        )
        review = (await client.get("/api/reviews")).json()[0]

        good = await client.post(
            f"/api/reviews/{review['review_id']}/mark", json={"quality": "good"}
        )
        again = await client.post(
            f"/api/reviews/{review['review_id']}/mark", json={"quality": "again"}
        )

        assert good.json()["interval_days"] == 3
        assert again.json()["interval_days"] == 1
        assert again.json()["step_index"] == 0
        assert again.json()["completed_at"] is not None
        assert again.json()["state"] == "upcoming"


@pytest.mark.asyncio
async def test_missed_review_appears_in_today_and_due_filter(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        _, _, lesson = await make_lesson(client)
        await client.patch(f"/api/lessons/{lesson['lesson_id']}", json={"status": "done"})
        async with factory() as session:
            review = await session.scalar(select(Review))
            review.next_review_at = datetime.now(timezone.utc) - timedelta(days=2)
            await session.commit()

        today = (await client.get("/api/today")).json()
        due = (await client.get("/api/reviews", params={"due_only": True})).json()

    assert today["reviews_due"][0]["state"] == "missed"
    assert due[0]["review_id"] == review.review_id


@pytest.mark.asyncio
async def test_today_and_search_are_scoped_and_ordered(sql_app) -> None:
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as first,
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as second,
    ):
        await register(first, "first@example.com")
        await register(second, "second@example.com")
        subject, _, lesson = await make_lesson(first, "Mathematics")
        await first.post(
            "/api/notebooks",
            json={
                "title": "Limit laws",
                "lesson_id": lesson["lesson_id"],
                "content": "limits",
            },
        )
        await first.post(
            "/api/tasks",
            json={
                "title": "Review limits",
                "lesson_id": lesson["lesson_id"],
                "due_date": datetime.now(timezone.utc).date().isoformat(),
            },
        )
        await first.post(
            "/api/timetable",
            json={
                "title": "Math class",
                "subject_id": subject["subject_id"],
                "day_of_week": datetime.now(timezone.utc).weekday(),
                "start_time": "09:00",
                "end_time": "10:00",
            },
        )

        today = (await first.get("/api/today")).json()
        search = (await first.get("/api/search", params={"q": "limit"})).json()
        isolated = (await second.get("/api/search", params={"q": "limit"})).json()

        assert today["tasks"][0]["title"] == "Review limits"
        assert today["timetable"][0]["title"] == "Math class"
        assert search["lessons"][0]["title"] == "Limits"
        assert search["notebooks"][0]["title"] == "Limit laws"
        assert search["tasks"][0]["title"] == "Review limits"
        assert all(not values for values in isolated.values())
