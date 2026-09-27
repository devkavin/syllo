"""Backend tests for Syllo iteration 2: onboarding fields, timetable CRUD,
spaced reviews on lesson done, review mark ladder, global search, /today extras."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().rstrip("/")
API = BASE + "/api"

DEMO_EMAIL = "demo@syllo.app"
DEMO_PW = "syllo123"


@pytest.fixture(scope="module")
def demo_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PW})
    assert r.status_code == 200
    return s


@pytest.fixture(scope="module")
def fresh_user():
    s = requests.Session()
    email = f"iter2_{uuid.uuid4().hex[:10]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "pass1234", "name": "Iter2"})
    assert r.status_code == 200
    return {"session": s, "email": email, "user": r.json()}


# ---------- Onboarding fields on register + PATCH /auth/me ----------
class TestOnboarding:
    def test_register_defaults(self, fresh_user):
        u = fresh_user["user"]
        assert u.get("onboarded") is False
        assert u.get("daily_goal_minutes") == 60

    def test_patch_me_persists(self, fresh_user):
        s = fresh_user["session"]
        r = s.patch(f"{API}/auth/me", json={"onboarded": True, "daily_goal_minutes": 120, "name": "X"})
        assert r.status_code == 200
        d = r.json()
        assert d["onboarded"] is True
        assert d["daily_goal_minutes"] == 120
        assert d["name"] == "X"
        # persistence via GET
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 200
        assert r2.json()["daily_goal_minutes"] == 120
        assert r2.json()["onboarded"] is True


# ---------- Timetable ----------
class TestTimetable:
    def test_demo_seeded_three(self, demo_session):
        r = demo_session.get(f"{API}/timetable")
        assert r.status_code == 200
        items = r.json()
        titles = {t["title"] for t in items}
        assert {"Math class", "Biology study block", "Literature seminar"}.issubset(titles)
        for t in items:
            assert "_id" not in t
            assert 0 <= t["day_of_week"] <= 6

    def test_crud_cycle(self, fresh_user):
        s = fresh_user["session"]
        r = s.post(f"{API}/timetable", json={
            "title": "TEST_Block", "subject_id": None, "day_of_week": 2,
            "start_time": "10:00", "end_time": "11:00", "kind": "study",
        })
        assert r.status_code == 200
        tid = r.json()["timetable_id"]
        assert r.json()["day_of_week"] == 2

        r = s.patch(f"{API}/timetable/{tid}", json={"title": "TEST_Block2", "start_time": "11:00"})
        assert r.status_code == 200
        assert r.json()["title"] == "TEST_Block2"
        assert r.json()["start_time"] == "11:00"

        r = s.get(f"{API}/timetable")
        assert any(x["timetable_id"] == tid for x in r.json())

        r = s.delete(f"{API}/timetable/{tid}")
        assert r.status_code == 200
        r = s.get(f"{API}/timetable")
        assert not any(x.get("timetable_id") == tid for x in r.json())

    def test_unauth(self):
        r = requests.get(f"{API}/timetable")
        assert r.status_code == 401


# ---------- Reviews (spaced repetition) ----------
class TestReviews:
    def _make_lesson(self, s):
        sub = s.post(f"{API}/subjects", json={"name": "TEST_R", "color": "sage"}).json()
        u = s.post(f"{API}/units", json={"subject_id": sub["subject_id"], "name": "U"}).json()
        l = s.post(f"{API}/lessons", json={"unit_id": u["unit_id"], "title": "TEST_Lesson_R"}).json()
        return l

    def test_mark_done_schedules_review(self, fresh_user):
        s = fresh_user["session"]
        lesson = self._make_lesson(s)
        lid = lesson["lesson_id"]
        r = s.patch(f"{API}/lessons/{lid}", json={"status": "done"})
        assert r.status_code == 200
        # review created with interval 1
        r = s.get(f"{API}/reviews")
        assert r.status_code == 200
        matching = [x for x in r.json() if x["lesson_id"] == lid]
        assert len(matching) == 1
        rv = matching[0]
        assert rv["interval_days"] == 1
        assert rv["step_index"] == 0
        assert rv["lesson_title"] == "TEST_Lesson_R"
        assert rv.get("subject_id")
        # next_review_at ~ tomorrow (allow a wide window)
        next_at = datetime.fromisoformat(rv["next_review_at"].replace("Z", "+00:00"))
        delta = next_at - datetime.now(timezone.utc)
        assert timedelta(hours=20) < delta < timedelta(hours=28)

    def test_mark_good_advances_and_again_resets(self, fresh_user):
        s = fresh_user["session"]
        lesson = self._make_lesson(s)
        lid = lesson["lesson_id"]
        s.patch(f"{API}/lessons/{lid}", json={"status": "done"})
        rv = [x for x in s.get(f"{API}/reviews").json() if x["lesson_id"] == lid][0]
        rid = rv["review_id"]

        # good => step 1, interval 3
        r = s.post(f"{API}/reviews/{rid}/mark", json={"quality": "good"})
        assert r.status_code == 200
        d = r.json()
        assert d["step_index"] == 1
        assert d["interval_days"] == 3

        # good again => step 2, interval 7
        r = s.post(f"{API}/reviews/{rid}/mark", json={"quality": "good"})
        assert r.json()["interval_days"] == 7

        # again resets
        r = s.post(f"{API}/reviews/{rid}/mark", json={"quality": "again"})
        assert r.json()["step_index"] == 0
        assert r.json()["interval_days"] == 1

    def test_reviews_unauth(self):
        assert requests.get(f"{API}/reviews").status_code == 401


# ---------- Global search ----------
class TestSearch:
    def test_search_demo_math(self, demo_session):
        r = demo_session.get(f"{API}/search", params={"q": "math"})
        assert r.status_code == 200
        d = r.json()
        for k in ["subjects", "lessons", "notebooks", "tasks"]:
            assert k in d and isinstance(d[k], list)
        # Case-insensitive: Mathematics subject
        assert any(s["name"].lower().startswith("math") for s in d["subjects"])

    def test_search_biology(self, demo_session):
        r = demo_session.get(f"{API}/search", params={"q": "biology"})
        assert r.status_code == 200
        d = r.json()
        # should hit subject Biology and the biology task
        assert any("biology" in s["name"].lower() for s in d["subjects"]) or \
               any("biology" in t["title"].lower() for t in d["tasks"])

    def test_search_unauth(self):
        assert requests.get(f"{API}/search", params={"q": "x"}).status_code == 401


# ---------- /today extras ----------
class TestTodayExtras:
    def test_new_keys(self, demo_session):
        r = demo_session.get(f"{API}/today")
        assert r.status_code == 200
        d = r.json()
        assert "timetable" in d and isinstance(d["timetable"], list)
        assert "reviews_due" in d and isinstance(d["reviews_due"], list)
        assert "daily_goal_minutes" in d and isinstance(d["daily_goal_minutes"], int)
