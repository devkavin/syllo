from __future__ import annotations

import httpx
import pytest


async def register(client: httpx.AsyncClient, email: str) -> None:
    response = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "study-pass", "name": email.split("@")[0]},
    )
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_curriculum_crud_and_cascade(sql_app) -> None:
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        subject = (
            await client.post(
                "/api/subjects",
                json={"name": "Mathematics", "color": "sage", "focus_minutes": 45},
            )
        ).json()
        unit = (
            await client.post(
                "/api/units",
                json={
                    "subject_id": subject["subject_id"],
                    "name": "Calculus",
                    "order": 1,
                },
            )
        ).json()
        lesson = (
            await client.post(
                "/api/lessons",
                json={"unit_id": unit["unit_id"], "title": "Limits", "order": 2},
            )
        ).json()

        assert (await client.get("/api/subjects")).json()[0]["name"] == "Mathematics"
        assert (
            await client.get(f"/api/subjects/{subject['subject_id']}/units")
        ).json()[0]["order"] == 1
        assert (await client.get(f"/api/units/{unit['unit_id']}/lessons")).json()[0][
            "order"
        ] == 2
        patched = await client.patch(
            f"/api/lessons/{lesson['lesson_id']}",
            json={"status": "in_progress", "notes": "Approach a value."},
        )
        assert patched.status_code == 200
        assert patched.json()["status"] == "in_progress"

        deleted = await client.delete(f"/api/subjects/{subject['subject_id']}")
        assert deleted.status_code == 200
        assert (
            await client.get(f"/api/lessons/{lesson['lesson_id']}")
        ).status_code == 404


@pytest.mark.asyncio
async def test_nested_resources_cannot_cross_user_boundaries(sql_app) -> None:
    app, _ = sql_app
    transport = httpx.ASGITransport(app=app)
    async with (
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as first,
        httpx.AsyncClient(transport=transport, base_url="http://testserver") as second,
    ):
        await register(first, "first@example.com")
        await register(second, "second@example.com")
        subject = (
            await first.post("/api/subjects", json={"name": "Physics", "color": "blue"})
        ).json()
        unit = (
            await first.post(
                "/api/units",
                json={"subject_id": subject["subject_id"], "name": "Mechanics"},
            )
        ).json()
        lesson = (
            await first.post(
                "/api/lessons",
                json={"unit_id": unit["unit_id"], "title": "Newton's Laws"},
            )
        ).json()

        assert (
            await second.post(
                "/api/units",
                json={"subject_id": subject["subject_id"], "name": "Stolen"},
            )
        ).status_code == 404
        assert (
            await second.post(
                "/api/tasks",
                json={"title": "Cross link", "lesson_id": lesson["lesson_id"]},
            )
        ).status_code == 404
        assert (
            await second.get(f"/api/lessons/{lesson['lesson_id']}")
        ).status_code == 404
        assert (
            await second.patch(
                f"/api/subjects/{subject['subject_id']}", json={"name": "X"}
            )
        ).status_code == 404


@pytest.mark.asyncio
async def test_notebook_task_and_timetable_lifecycle(sql_app) -> None:
    app, _ = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        subject = (await client.post("/api/subjects", json={"name": "Biology"})).json()
        unit = (
            await client.post(
                "/api/units",
                json={"subject_id": subject["subject_id"], "name": "Cells"},
            )
        ).json()
        lesson = (
            await client.post(
                "/api/lessons", json={"unit_id": unit["unit_id"], "title": "Mitosis"}
            )
        ).json()

        notebook = (
            await client.post(
                "/api/notebooks",
                json={
                    "title": "Mitosis notes",
                    "lesson_id": lesson["lesson_id"],
                    "content": "Prophase",
                },
            )
        ).json()
        task = (
            await client.post(
                "/api/tasks",
                json={
                    "title": "Review diagram",
                    "lesson_id": lesson["lesson_id"],
                    "due_date": "2026-09-29",
                },
            )
        ).json()
        timetable = (
            await client.post(
                "/api/timetable",
                json={
                    "title": "Biology",
                    "subject_id": subject["subject_id"],
                    "day_of_week": 1,
                    "start_time": "09:00",
                    "end_time": "10:00",
                },
            )
        ).json()

        assert (await client.get(f"/api/notebooks/{notebook['notebook_id']}")).json()[
            "content"
        ] == "Prophase"
        assert (
            await client.patch(
                f"/api/tasks/{task['task_id']}", json={"completed": True}
            )
        ).json()["completed_at"]
        assert (
            await client.patch(
                f"/api/timetable/{timetable['timetable_id']}",
                    json={"start_time": "10:00", "end_time": "11:00"},
            )
        ).json()["start_time"] == "10:00"
        assert (
            await client.delete(f"/api/notebooks/{notebook['notebook_id']}")
        ).status_code == 200
        assert (await client.delete(f"/api/tasks/{task['task_id']}")).status_code == 200
        assert (
            await client.delete(f"/api/timetable/{timetable['timetable_id']}")
        ).status_code == 200
