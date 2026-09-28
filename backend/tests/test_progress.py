from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest

from backend.tests.test_academic_crud import register
from backend.tests.test_today_search_reviews import make_lesson


@pytest.mark.asyncio
async def test_progress_uses_recorded_activity_and_database_aggregates(sql_app) -> None:
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        math, _, math_lesson = await make_lesson(client, "Mathematics")
        physics, _, physics_lesson = await make_lesson(client, "Physics")
        now = datetime.now(timezone.utc)
        for subject, lesson, duration, started in (
            (math, math_lesson, 3600, now),
            (math, math_lesson, 1800, now - timedelta(days=1)),
            (physics, physics_lesson, 2700, now - timedelta(days=8)),
        ):
            response = await client.post(
                "/api/sessions",
                json={
                    "subject_id": subject["subject_id"],
                    "lesson_id": lesson["lesson_id"],
                    "duration_seconds": duration,
                    "started_at": started.isoformat(),
                },
            )
            assert response.status_code == 200

        progress = (await client.get("/api/analytics")).json()

    assert progress["total_seconds"] == 8100
    assert progress["weekly_seconds"] == 5400
    assert progress["monthly_seconds"] == 8100
    assert progress["sessions_completed"] == 3
    assert progress["lessons_studied"] == 2
    assert len(progress["daily"]) == 14
    assert len(progress["heatmap"]) == 30
    assert progress["by_subject"][0]["name"] == "Mathematics"
    assert progress["by_subject"][0]["seconds"] == 5400


@pytest.mark.asyncio
async def test_progress_empty_state_is_stable(sql_app) -> None:
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        progress = (await client.get("/api/analytics")).json()

    assert progress["total_seconds"] == 0
    assert progress["weekly_seconds"] == 0
    assert progress["by_subject"] == []
    assert all(day["seconds"] == 0 for day in progress["heatmap"])
