from datetime import datetime, timedelta, timezone
from uuid import uuid4
import httpx
import pytest
from sqlalchemy import select
from backend.app.models import Circle, CircleMember, StudySession, User
from backend.tests.test_student_launch import person, headers


async def setup_circle(sql_app):
    app, factory = sql_app
    owner = await person(factory, "owner-schedule@example.com")
    friend = await person(factory, "friend-schedule@example.com")
    stranger = await person(factory, "stranger-schedule@example.com")
    async with factory() as s:
        for user in (owner, friend, stranger):
            actual = await s.get(User, user.user_id); actual.timezone = "UTC"
        circle = Circle(owner_id=owner.user_id, name="Study friends", invite_token=str(uuid4()))
        s.add(circle); await s.flush()
        s.add_all([CircleMember(circle_id=circle.circle_id, user_id=u.user_id) for u in (owner, friend)])
        await s.commit()
    day = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
    return app, factory, owner, friend, stranger, circle.circle_id, day


@pytest.mark.asyncio
async def test_availability_is_private_and_bounded(sql_app):
    app, _, owner, friend, _, cid, day = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        a = headers(app, owner); b = headers(app, friend)
        detail = (await c.get(f"/api/circles/{cid}", headers=a)).json()
        assert detail["share_availability"] is False
        assert (await c.get("/api/availability", headers=a)).json() == {"windows": [], "exclusions": []}
        body = {"windows": [{"day_of_week": day.weekday(), "start_time": "09:00", "end_time": "12:00"}], "exclusions": []}
        assert (await c.put("/api/availability", headers=a, json=body)).status_code == 200
        assert (await c.get("/api/availability", headers=b)).json()["windows"] == []
        assert (await c.put("/api/availability", headers=a, json={**body, "windows": body["windows"] * 29})).status_code == 422
        assert (await c.put("/api/availability", headers=a, json={"windows": [], "exclusions": [{"start": day.isoformat(), "end": (day - timedelta(minutes=1)).isoformat()}]})).status_code == 422


@pytest.mark.asyncio
async def test_slots_require_explicit_windows_and_sharing_and_hide_busy_titles(sql_app):
    app, _, owner, friend, stranger, cid, day = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        a, b = headers(app, owner), headers(app, friend)
        body = {"participants": [owner.user_id, friend.user_id], "start": day.isoformat(), "end": (day + timedelta(hours=3)).isoformat(), "duration_minutes": 45}
        assert (await c.post(f"/api/circles/{cid}/availability", headers=headers(app, stranger), json=body)).status_code == 404
        r = await c.post(f"/api/circles/{cid}/availability", headers=a, json=body)
        assert r.status_code == 200 and r.json()["available"] is False
        for h in (a, b):
            assert (await c.patch(f"/api/circles/{cid}/privacy", headers=h, json={"share_availability": True})).status_code == 200
        assert (await c.post(f"/api/circles/{cid}/availability", headers=a, json=body)).json()["slots"] == []
        for h in (a, b):
            await c.put("/api/availability", headers=h, json={"windows": [{"day_of_week": day.weekday(), "start_time": "09:00", "end_time": "12:00"}], "exclusions": []})
        await c.post("/api/timetable", headers=b, json={"title": "Secret therapy appointment", "day_of_week": day.weekday(), "start_time": "09:00", "end_time": "10:00", "recurrence": "none", "date": day.date().isoformat()})
        await c.put("/api/availability", headers=a, json={"windows": [{"day_of_week": day.weekday(), "start_time": "09:00", "end_time": "12:00"}], "exclusions": [{"start": (day + timedelta(hours=1)).isoformat(), "end": (day + timedelta(hours=1, minutes=30)).isoformat()}]})
        r = await c.post(f"/api/circles/{cid}/availability", headers=a, json=body)
        assert r.status_code == 200 and r.json()["available"] is True
        assert r.json()["slots"][0]["start"] == (day + timedelta(hours=1, minutes=30)).isoformat()
        assert len(r.json()["slots"]) <= 5
        assert "Secret" not in r.text and "windows" not in r.text


@pytest.mark.asyncio
async def test_event_acceptance_reschedule_conflicts_and_cancel_preserve_history(sql_app):
    app, factory, owner, friend, stranger, cid, day = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        a, b = headers(app, owner), headers(app, friend)
        url = f"/api/circles/{cid}/sessions"
        body = {"topic": "Limits together", "participants": [owner.user_id, friend.user_id], "start": day.isoformat(), "end": (day + timedelta(hours=1)).isoformat()}
        created = await c.post(url, headers=a, json=body)
        assert created.status_code == 201
        event = created.json(); eid = event["id"]
        assert event["my_status"] == "accepted"
        assert (await c.get(url, headers=b)).json()[0]["my_status"] == "invited"
        assert (await c.get(url, headers=headers(app, stranger))).status_code == 404
        agenda_params = {"start": day.isoformat(), "end": (day + timedelta(hours=2)).isoformat()}
        assert (await c.get("/api/agenda", headers=b, params=agenda_params)).json()["items"] == []
        assert (await c.post(f"{url}/{eid}/respond", headers=b, json={"status": "accepted", "revision": 1})).status_code == 200
        assert (await c.get("/api/agenda", headers=b, params=agenda_params)).json()["items"][0]["href"] == f"/timer?event={eid}"
        conflict = await c.post("/api/timetable", headers=b, json={"title": "Class", "day_of_week": day.weekday(), "start_time": "09:30", "end_time": "10:30", "recurrence": "none", "date": day.date().isoformat()})
        assert conflict.status_code == 409
        changed = await c.patch(f"{url}/{eid}", headers=a, json={"start": (day + timedelta(hours=1)).isoformat(), "end": (day + timedelta(hours=2)).isoformat(), "revision": 1})
        assert changed.status_code == 200 and changed.json()["revision"] == 2
        assert (await c.post(f"{url}/{eid}/respond", headers=b, json={"status": "accepted", "revision": 1})).status_code == 409
        assert (await c.post(f"{url}/{eid}/respond", headers=b, json={"status": "accepted", "revision": 2})).status_code == 200
        recorded = await c.post("/api/sessions", headers=b, json={"request_id": str(uuid4()), "circle_event_id": eid, "duration_seconds": 60, "started_at": datetime.now(timezone.utc).isoformat()})
        assert recorded.status_code == 200 and recorded.json()["duration_seconds"] == 60
        assert (await c.delete(f"{url}/{eid}", headers=a)).status_code == 204
        assert (await c.get("/api/agenda", headers=b, params=agenda_params)).json()["items"] == []
        assert (await c.get("/api/analytics", headers=b)).json()["total_seconds"] == 60
        assert (await c.delete(f"/api/circles/{cid}", headers=a)).status_code == 204
    async with factory() as s:
        saved = await s.scalar(select(StudySession).where(StudySession.user_id == friend.user_id))
        assert saved.duration_seconds == 60 and saved.circle_event_id is None


@pytest.mark.asyncio
async def test_removal_revokes_events_and_goal_links_are_author_only(sql_app):
    app, _, owner, friend, _, cid, day = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        a, b = headers(app, owner), headers(app, friend)
        task = (await c.post("/api/tasks", headers=b, json={"title": "Private exercise"})).json()
        goal = await c.post(f"/api/circles/{cid}/goals", headers=b, json={"title": "Finish my exercise", "task_id": task["task_id"]})
        assert goal.status_code == 201
        own = (await c.get(f"/api/circles/{cid}", headers=b)).json()["goals"][0]
        other = (await c.get(f"/api/circles/{cid}", headers=a)).json()["goals"][0]
        assert own["task_id"] == task["task_id"] and "task_id" not in other
        url = f"/api/circles/{cid}/sessions"
        event = (await c.post(url, headers=a, json={"topic": "Study", "participants": [owner.user_id, friend.user_id], "start": day.isoformat(), "end": (day + timedelta(hours=1)).isoformat()})).json()
        assert (await c.delete(f"/api/circles/{cid}/members/{friend.user_id}", headers=a)).status_code == 204
        assert (await c.get(url, headers=b)).status_code == 404
        assert (await c.post(f"{url}/{event['id']}/respond", headers=b, json={"status": "accepted", "revision": 1})).status_code == 404
        assert (await c.get("/api/tasks", headers=b)).json()[0]["title"] == "Private exercise"


@pytest.mark.asyncio
async def test_adjacent_availability_windows_form_one_free_period(sql_app):
    app, _, owner, _, _, cid, day = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        h = headers(app, owner)
        await c.patch(f"/api/circles/{cid}/privacy", headers=h, json={"share_availability": True})
        await c.put("/api/availability", headers=h, json={"windows": [{"day_of_week": day.weekday(), "start_time": "09:00", "end_time": "09:30"}, {"day_of_week": day.weekday(), "start_time": "09:30", "end_time": "10:00"}], "exclusions": []})
        result = await c.post(f"/api/circles/{cid}/availability", headers=h, json={"participants": [owner.user_id], "start": day.isoformat(), "end": (day + timedelta(hours=1)).isoformat(), "duration_minutes": 45})
        assert result.status_code == 200 and result.json()["slots"][0]["start"] == day.isoformat()


@pytest.mark.asyncio
async def test_timezone_change_cannot_shift_classes_into_accepted_sessions(sql_app):
    app, _, owner, _, _, cid, day = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        h = headers(app, owner)
        block = await c.post("/api/timetable", headers=h, json={"title": "Weekly class", "day_of_week": day.weekday(), "start_time": "10:00", "end_time": "11:00", "recurrence": "weekly"})
        assert block.status_code == 200
        event = await c.post(f"/api/circles/{cid}/sessions", headers=h, json={"topic": "Study", "participants": [owner.user_id], "start": (day + timedelta(hours=6)).isoformat(), "end": (day + timedelta(hours=7)).isoformat()})
        assert event.status_code == 201
        changed = await c.patch("/api/auth/me", headers=h, json={"timezone": "America/Bogota"})
        assert changed.status_code == 409
        assert (await c.get("/api/auth/me", headers=h)).json()["timezone"] == "UTC"


@pytest.mark.asyncio
async def test_fold_suggestions_use_first_occurrence_without_duplicate_clocks(sql_app):
    from zoneinfo import ZoneInfo
    app, _, owner, _, _, cid, _ = await setup_circle(sql_app)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as c:
        h = headers(app, owner)
        await c.patch("/api/auth/me", headers=h, json={"timezone": "America/New_York"})
        await c.patch(f"/api/circles/{cid}/privacy", headers=h, json={"share_availability": True})
        await c.put("/api/availability", headers=h, json={"windows": [{"day_of_week": 6, "start_time": "01:00", "end_time": "02:00"}], "exclusions": []})
        result = await c.post(f"/api/circles/{cid}/availability", headers=h, json={"participants": [owner.user_id], "start": "2026-11-01T04:00:00Z", "end": "2026-11-01T08:00:00Z", "duration_minutes": 30})
        assert result.status_code == 200 and result.json()["slots"]
        starts = [datetime.fromisoformat(slot["start"]).astimezone(ZoneInfo("America/New_York")) for slot in result.json()["slots"]]
        assert all(start.fold == 0 for start in starts)
        assert len({start.strftime("%H:%M") for start in starts}) == len(starts)
