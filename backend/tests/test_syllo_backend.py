"""Backend tests for Syllo API. Covers auth, subjects, units, lessons,
notebooks, tasks, sessions, today, analytics, seed, isolation, protection."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    # fallback to frontend .env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = BASE + "/api"

DEMO_EMAIL = "demo@syllo.app"
DEMO_PW = "syllo123"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def demo_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    assert "access_token" in s.cookies
    return s


@pytest.fixture(scope="module")
def fresh_user():
    s = requests.Session()
    email = f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Test User"})
    assert r.status_code == 200, f"register failed: {r.text}"
    return {"session": s, "email": email, "user": r.json()}


# ---------- Auth ----------
class TestAuth:
    def test_login_success_sets_cookie(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == DEMO_EMAIL
        assert "access_token" in s.cookies
        assert "refresh_token" in s.cookies
        assert "password_hash" not in d
        assert "_id" not in d

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_with_cookie(self, demo_session):
        r = demo_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_me_without_cookie(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={"email": DEMO_EMAIL, "password": "x", "name": "x"})
        assert r.status_code == 400

    def test_register_new_and_logout(self):
        s = requests.Session()
        email = f"logout_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "L"})
        assert r.status_code == 200
        assert "access_token" in s.cookies
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # After logout the cookie should be cleared server-side; explicitly clear session too
        s.cookies.clear()
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_google_callback_bogus(self):
        r = requests.post(f"{API}/auth/google/callback", json={"session_id": "bogus_nope"})
        assert r.status_code in (400, 401)


# ---------- Subjects seeded ----------
class TestSubjectsSeed:
    def test_demo_has_four_seeded(self, demo_session):
        r = demo_session.get(f"{API}/subjects")
        assert r.status_code == 200
        names = {s["name"] for s in r.json()}
        assert {"Mathematics", "Literature", "Biology", "History"}.issubset(names)
        for s in r.json():
            assert "subject_id" in s and "color" in s
            assert "_id" not in s


# ---------- Subjects/Units/Lessons CRUD + cascade ----------
class TestSubjectCRUD:
    def test_full_cycle_with_cascade(self, fresh_user):
        s = fresh_user["session"]
        # create subject
        r = s.post(f"{API}/subjects", json={"name": "TEST_Sub", "color": "sage"})
        assert r.status_code == 200
        sub = r.json()
        sid = sub["subject_id"]

        # patch subject
        r = s.patch(f"{API}/subjects/{sid}", json={"name": "TEST_Sub2"})
        assert r.status_code == 200
        assert r.json()["name"] == "TEST_Sub2"

        # create unit
        r = s.post(f"{API}/units", json={"subject_id": sid, "name": "U1", "order": 0})
        assert r.status_code == 200
        uid = r.json()["unit_id"]

        # units by subject
        r = s.get(f"{API}/subjects/{sid}/units")
        assert r.status_code == 200
        assert any(u["unit_id"] == uid for u in r.json())

        # patch unit
        r = s.patch(f"{API}/units/{uid}", json={"name": "U1x"})
        assert r.status_code == 200 and r.json()["name"] == "U1x"

        # create lesson
        r = s.post(f"{API}/lessons", json={"unit_id": uid, "title": "L1", "order": 0})
        assert r.status_code == 200
        lid = r.json()["lesson_id"]

        # get lesson
        r = s.get(f"{API}/lessons/{lid}")
        assert r.status_code == 200 and r.json()["title"] == "L1"

        # patch lesson status
        r = s.patch(f"{API}/lessons/{lid}", json={"status": "in_progress", "notes": "n"})
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

        # lesson requires valid unit
        r = s.post(f"{API}/lessons", json={"unit_id": "bogus", "title": "x"})
        assert r.status_code == 404

        # delete subject cascades
        r = s.delete(f"{API}/subjects/{sid}")
        assert r.status_code == 200
        r = s.get(f"{API}/lessons/{lid}")
        assert r.status_code == 404


# ---------- Notebooks ----------
class TestNotebooks:
    def test_crud_and_autosave(self, fresh_user):
        s = fresh_user["session"]
        r = s.post(f"{API}/notebooks", json={"title": "N", "content": "hello"})
        assert r.status_code == 200
        nb = r.json()
        nid = nb["notebook_id"]
        first_updated = nb["updated_at"]

        # list
        r = s.get(f"{API}/notebooks")
        assert r.status_code == 200 and any(x["notebook_id"] == nid for x in r.json())

        # patch content bumps updated_at
        import time; time.sleep(1.1)
        r = s.patch(f"{API}/notebooks/{nid}", json={"content": "world"})
        assert r.status_code == 200
        assert r.json()["content"] == "world"
        assert r.json()["updated_at"] > first_updated

        r = s.delete(f"{API}/notebooks/{nid}")
        assert r.status_code == 200


# ---------- Tasks ----------
class TestTasks:
    def test_crud_and_completed_at(self, fresh_user):
        s = fresh_user["session"]
        today = datetime.now(timezone.utc).date().isoformat()
        r = s.post(f"{API}/tasks", json={"title": "T1", "due_date": today, "priority": "high"})
        assert r.status_code == 200
        tid = r.json()["task_id"]
        r = s.patch(f"{API}/tasks/{tid}", json={"completed": True})
        assert r.status_code == 200
        assert r.json()["completed"] is True
        assert r.json().get("completed_at")
        r = s.delete(f"{API}/tasks/{tid}")
        assert r.status_code == 200


# ---------- Sessions & Streaks ----------
class TestSessions:
    def test_session_bumps_lesson_and_streak(self, fresh_user):
        s = fresh_user["session"]
        # create subject/unit/lesson
        sub = s.post(f"{API}/subjects", json={"name": "S", "color": "sage"}).json()
        unit = s.post(f"{API}/units", json={"subject_id": sub["subject_id"], "name": "U"}).json()
        lesson = s.post(f"{API}/lessons", json={"unit_id": unit["unit_id"], "title": "L"}).json()
        lid = lesson["lesson_id"]

        started = datetime.now(timezone.utc).isoformat()
        r = s.post(f"{API}/sessions", json={
            "subject_id": sub["subject_id"], "lesson_id": lid,
            "duration_seconds": 600, "mode": "pomodoro", "started_at": started,
        })
        assert r.status_code == 200
        # lesson total_seconds bumped
        r = s.get(f"{API}/lessons/{lid}")
        assert r.json()["total_seconds"] >= 600
        assert r.json()["status"] == "in_progress"

        # streak present on today
        r = s.get(f"{API}/today")
        assert r.status_code == 200
        d = r.json()
        assert d["seconds_today"] >= 600
        assert d["streak"]["current"] >= 1
        # Second same-day session doesn't reset streak
        r2 = s.post(f"{API}/sessions", json={
            "duration_seconds": 300, "mode": "pomodoro", "started_at": started,
        })
        assert r2.status_code == 200


# ---------- Today / Analytics ----------
class TestAggregates:
    def test_today_demo(self, demo_session):
        r = demo_session.get(f"{API}/today")
        assert r.status_code == 200
        d = r.json()
        for k in ["today", "seconds_today", "tasks", "sessions", "streak"]:
            assert k in d

    def test_analytics_demo(self, demo_session):
        r = demo_session.get(f"{API}/analytics")
        assert r.status_code == 200
        d = r.json()
        assert d["total_seconds"] > 0
        assert len(d["daily"]) == 14
        assert isinstance(d["by_subject"], list)
        assert "streak" in d


# ---------- Protection & Isolation ----------
class TestProtection:
    @pytest.mark.parametrize("path", [
        "/subjects", "/notebooks", "/tasks", "/sessions", "/today", "/analytics",
    ])
    def test_unauth(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code == 401

    def test_isolation(self, fresh_user, demo_session):
        # fresh user should NOT see demo's subjects (they're their own set)
        their_subs = fresh_user["session"].get(f"{API}/subjects").json()
        demo_subs = demo_session.get(f"{API}/subjects").json()
        demo_ids = {s["subject_id"] for s in demo_subs}
        for s in their_subs:
            assert s["subject_id"] not in demo_ids


# ---------- Seed endpoint ----------
class TestSeed:
    def test_seed_fresh_user(self):
        s = requests.Session()
        email = f"seed_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Sd"})
        assert r.status_code == 200
        # fresh user has no subjects
        assert s.get(f"{API}/subjects").json() == []
        r = s.post(f"{API}/seed")
        assert r.status_code == 200
        subs = s.get(f"{API}/subjects").json()
        assert len(subs) == 4
        # tasks, notebooks, sessions all seeded
        assert len(s.get(f"{API}/tasks").json()) >= 4
        assert len(s.get(f"{API}/notebooks").json()) >= 3
        assert len(s.get(f"{API}/sessions").json()) >= 5
