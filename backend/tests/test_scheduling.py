from datetime import datetime, timedelta, timezone
import httpx
import pytest
from backend.tests.test_academic_crud import register


@pytest.mark.asyncio
async def test_one_off_requires_date_and_timezone_is_validated(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "planner@example.com")
        body = {"title": "Exam", "day_of_week": 0, "start_time": "09:00", "end_time": "10:00", "recurrence": "none", "kind": "exam"}
        assert (await client.post("/api/timetable", json=body)).status_code == 422
        assert (await client.patch("/api/auth/me", json={"timezone": "Invalid/Zone"})).status_code == 422
        updated = await client.patch("/api/auth/me", json={"timezone": "Asia/Colombo"})
        assert updated.json()["timezone"] == "Asia/Colombo"
        invalid = {**body, "date": "2026-10-05", "start_time": "25:90"}
        assert (await client.post("/api/timetable", json=invalid)).status_code == 422


@pytest.mark.asyncio
async def test_dated_exam_occurs_once_in_owned_agenda(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "agenda@example.com")
        await client.patch("/api/auth/me", json={"timezone": "Asia/Colombo"})
        response = await client.post("/api/timetable", json={"title": "Physics exam", "day_of_week": 0, "start_time": "09:00", "end_time": "10:00", "recurrence": "none", "kind": "exam", "date": "2026-10-05"})
        assert response.status_code == 200
        result = await client.get("/api/agenda", params={"start": "2026-10-04T00:00:00Z", "end": "2026-10-19T00:00:00Z"})
        assert result.status_code == 200
        exams = [i for i in result.json()["items"] if i["title"] == "Physics exam"]
        assert len(exams) == 1
        assert exams[0]["starts_at"] == "2026-10-05T03:30:00+00:00"


@pytest.mark.asyncio
async def test_dst_gap_and_fold_require_explicit_valid_instant(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        await register(client, "dst@example.com")
        await client.patch("/api/auth/me", json={"timezone": "America/New_York"})
        body = {"title": "Study", "day_of_week": 6, "recurrence": "none", "start_time": "02:30", "end_time": "03:30", "date": "2026-03-08"}
        assert (await client.post("/api/timetable", json=body)).status_code == 422
        body.update(date="2026-11-01", start_time="01:15", end_time="01:45")
        assert (await client.post("/api/timetable", json=body)).status_code == 422
        assert (await client.post("/api/timetable", json={**body, "utc_offset_minutes": -300})).status_code == 200
@pytest.mark.asyncio
async def test_timezone_inference_never_replaces_saved_choice(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        await register(c, "timezone@example.com")
        result = await c.post("/api/auth/timezone", json={"timezone": "Asia/Colombo"})
        assert result.status_code == 200 and result.json()["timezone"] == "Asia/Colombo"
        await c.patch("/api/auth/me", json={"timezone": "America/New_York"})
        assert (await c.post("/api/auth/timezone", json={"timezone": "Asia/Colombo"})).json()["timezone"] == "America/New_York"
        assert (await c.patch("/api/auth/me", json={"timezone": None})).json()["timezone"] is None


@pytest.mark.asyncio
async def test_metadata_edit_keeps_one_off_instant_after_timezone_change(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        await register(c, "unchanged-exam@example.com")
        await c.patch("/api/auth/me", json={"timezone": "UTC"})
        item = (await c.post("/api/timetable", json={"title": "Exam", "day_of_week": 0, "start_time": "09:00", "end_time": "10:00", "recurrence": "none", "date": "2026-10-05"})).json()
        await c.patch("/api/auth/me", json={"timezone": "Asia/Colombo"})
        assert (await c.patch(f"/api/timetable/{item['timetable_id']}", json={"title": "Renamed exam"})).status_code == 200
        result = await c.get("/api/agenda", params={"start": "2026-10-05T00:00:00Z", "end": "2026-10-06T00:00:00Z"})
        assert result.json()["items"][0]["starts_at"] == "2026-10-05T09:00:00+00:00"


@pytest.mark.asyncio
async def test_metadata_edit_and_form_roundtrip_keep_fold_instant(sql_app):
    app, _ = sql_app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        await register(c, "unchanged-fold@example.com")
        await c.patch("/api/auth/me", json={"timezone": "America/New_York"})
        body = {"title": "Fold study", "day_of_week": 6, "recurrence": "none", "start_time": "01:15", "end_time": "01:45", "date": "2026-11-01", "utc_offset_minutes": -300}
        item = (await c.post("/api/timetable", json=body)).json()
        response = await c.patch(f"/api/timetable/{item['timetable_id']}", json={"title": "Updated fold study"})
        assert response.status_code == 200
        roundtrip = {key: value for key, value in body.items() if key != "utc_offset_minutes"}
        assert (await c.patch(f"/api/timetable/{item['timetable_id']}", json=roundtrip)).status_code == 200
        result = await c.get("/api/agenda", params={"start": "2026-11-01T00:00:00Z", "end": "2026-11-02T00:00:00Z"})
        assert result.json()["items"][0]["starts_at"] == "2026-11-01T06:15:00+00:00"


@pytest.mark.asyncio
async def test_today_legacy_timetable_agrees_after_one_off_changes_local_day(sql_app):
    from zoneinfo import ZoneInfo
    app, _ = sql_app
    local_day = datetime.now(timezone.utc).astimezone(ZoneInfo("Asia/Colombo")).date()
    prior_day = local_day - timedelta(days=1)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        await register(c, "local-day-exam@example.com")
        await c.patch("/api/auth/me", json={"timezone": "UTC"})
        item = (await c.post("/api/timetable", json={"title": "Dated exam", "day_of_week": prior_day.weekday(), "recurrence": "none", "date": prior_day.isoformat(), "start_time": "23:30", "end_time": "23:59"})).json()
        await c.patch("/api/auth/me", json={"timezone": "Asia/Colombo"})
        today = (await c.get("/api/today")).json()
        assert any(i["id"] == item["timetable_id"] for i in today["agenda"])
        assert any(i["timetable_id"] == item["timetable_id"] for i in today["timetable"])
