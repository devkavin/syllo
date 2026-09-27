"""
Syllo backend. FastAPI + MongoDB. Auth: JWT email/password + Emergent Google Auth.
All routes prefixed with /api. Users have user_id (UUID). No MongoDB _id leaks.
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import jwt
import bcrypt
import httpx
import logging
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------- Setup ----------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ACCESS_TTL_MIN = 60 * 24 * 7  # 7 days for easier study workflow
REFRESH_TTL_DAYS = 30

app = FastAPI(title="Syllo API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("syllo")


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, kind: str = "access") -> str:
    now = datetime.now(timezone.utc)
    exp = now + (timedelta(minutes=ACCESS_TTL_MIN) if kind == "access" else timedelta(days=REFRESH_TTL_DAYS))
    payload = {"sub": user_id, "type": kind, "exp": exp, "iat": now}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def set_auth_cookies(resp: Response, user_id: str):
    access = create_token(user_id, "access")
    refresh = create_token(user_id, "refresh")
    resp.set_cookie("access_token", access, httponly=True, secure=True, samesite="none",
                    max_age=ACCESS_TTL_MIN * 60, path="/")
    resp.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none",
                    max_age=REFRESH_TTL_DAYS * 24 * 3600, path="/")


def clear_auth_cookies(resp: Response):
    resp.delete_cookie("access_token", path="/")
    resp.delete_cookie("refresh_token", path="/")


async def get_current_user(request: Request) -> Dict[str, Any]:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token")
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str(tz_offset_min: int = 0) -> str:
    # returns YYYY-MM-DD in user's local day
    now = datetime.now(timezone.utc) + timedelta(minutes=tz_offset_min)
    return now.date().isoformat()


# ---------- Pydantic Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class GoogleCallbackIn(BaseModel):
    session_id: str

class SubjectIn(BaseModel):
    name: str
    color: str = "sage"  # from palette
    description: Optional[str] = ""

class SubjectPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None

class UnitIn(BaseModel):
    subject_id: str
    name: str
    description: Optional[str] = ""
    order: int = 0

class UnitPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None

class LessonIn(BaseModel):
    unit_id: str
    title: str
    notes: Optional[str] = ""
    order: int = 0

class LessonPatch(BaseModel):
    title: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None  # not_started | in_progress | done
    order: Optional[int] = None

class NotebookIn(BaseModel):
    title: str
    subject_id: Optional[str] = None
    content: str = ""

class NotebookPatch(BaseModel):
    title: Optional[str] = None
    subject_id: Optional[str] = None
    content: Optional[str] = None

class TaskIn(BaseModel):
    title: str
    subject_id: Optional[str] = None
    due_date: Optional[str] = None  # YYYY-MM-DD
    priority: str = "normal"  # low | normal | high
    notes: Optional[str] = ""

class TaskPatch(BaseModel):
    title: Optional[str] = None
    subject_id: Optional[str] = None
    due_date: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None

class SessionIn(BaseModel):
    subject_id: Optional[str] = None
    lesson_id: Optional[str] = None
    duration_seconds: int
    mode: str = "pomodoro"  # pomodoro | stopwatch
    started_at: str  # ISO
    note: Optional[str] = ""

class TimetableIn(BaseModel):
    title: str
    subject_id: Optional[str] = None
    day_of_week: int  # 0=Mon .. 6=Sun
    start_time: str  # "HH:MM"
    end_time: str    # "HH:MM"
    location: Optional[str] = ""
    kind: str = "class"  # class | study

class TimetablePatch(BaseModel):
    title: Optional[str] = None
    subject_id: Optional[str] = None
    day_of_week: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    kind: Optional[str] = None

class ReviewOutcome(BaseModel):
    quality: str  # good | again


# ---------- Auth Routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    user_id = f"user_{uuid.uuid4().hex[:16]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": body.name.strip(),
        "picture": None,
        "auth_provider": "password",
        "password_hash": hash_password(body.password),
        "onboarded": False,
        "theme": "light",
        "timezone_offset_min": 0,
        "daily_goal_minutes": 60,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    set_auth_cookies(response, user_id)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    set_auth_cookies(response, user["user_id"])
    user.pop("password_hash", None)
    user.pop("_id", None)
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user


@api.post("/auth/google/callback")
async def google_callback(body: GoogleCallbackIn, response: Response):
    """Exchange emergent session_id for user info, then mint our JWT cookies."""
    async with httpx.AsyncClient(timeout=15) as http:
        r = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
        if r.status_code != 200:
            raise HTTPException(401, "Google session invalid")
        data = r.json()
    email = (data.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(400, "Google returned no email")
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "name": existing.get("name") or data.get("name"),
            "picture": data.get("picture") or existing.get("picture"),
        }})
    else:
        user_id = f"user_{uuid.uuid4().hex[:16]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name") or email.split("@")[0],
            "picture": data.get("picture"),
            "auth_provider": "google",
            "password_hash": None,
            "onboarded": False,
            "theme": "light",
            "timezone_offset_min": 0,
            "daily_goal_minutes": 60,
            "created_at": now_iso(),
        })
    set_auth_cookies(response, user_id)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return user


class ProfilePatch(BaseModel):
    name: Optional[str] = None
    theme: Optional[str] = None
    timezone_offset_min: Optional[int] = None
    onboarded: Optional[bool] = None
    daily_goal_minutes: Optional[int] = None


@api.patch("/auth/me")
async def update_me(patch: ProfilePatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in patch.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password_hash": 0})


# ---------- Subjects ----------
@api.get("/subjects")
async def list_subjects(user=Depends(get_current_user)):
    items = await db.subjects.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items


@api.post("/subjects")
async def create_subject(body: SubjectIn, user=Depends(get_current_user)):
    sid = f"sub_{uuid.uuid4().hex[:12]}"
    doc = {"subject_id": sid, "user_id": user["user_id"], **body.model_dump(), "created_at": now_iso()}
    await db.subjects.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/subjects/{sid}")
async def patch_subject(sid: str, body: SubjectPatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.subjects.update_one({"subject_id": sid, "user_id": user["user_id"]}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Subject not found")
    return await db.subjects.find_one({"subject_id": sid}, {"_id": 0})


@api.delete("/subjects/{sid}")
async def delete_subject(sid: str, user=Depends(get_current_user)):
    await db.subjects.delete_one({"subject_id": sid, "user_id": user["user_id"]})
    await db.units.delete_many({"subject_id": sid, "user_id": user["user_id"]})
    await db.lessons.delete_many({"subject_id": sid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Units ----------
@api.get("/subjects/{sid}/units")
async def list_units(sid: str, user=Depends(get_current_user)):
    units = await db.units.find({"subject_id": sid, "user_id": user["user_id"]}, {"_id": 0}).sort("order", 1).to_list(500)
    return units


@api.post("/units")
async def create_unit(body: UnitIn, user=Depends(get_current_user)):
    uid = f"unt_{uuid.uuid4().hex[:12]}"
    doc = {"unit_id": uid, "user_id": user["user_id"], **body.model_dump(), "created_at": now_iso()}
    await db.units.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/units/{uid}")
async def patch_unit(uid: str, body: UnitPatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.units.update_one({"unit_id": uid, "user_id": user["user_id"]}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Unit not found")
    return await db.units.find_one({"unit_id": uid}, {"_id": 0})


@api.delete("/units/{uid}")
async def delete_unit(uid: str, user=Depends(get_current_user)):
    await db.units.delete_one({"unit_id": uid, "user_id": user["user_id"]})
    await db.lessons.delete_many({"unit_id": uid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Lessons ----------
@api.get("/units/{uid}/lessons")
async def list_lessons(uid: str, user=Depends(get_current_user)):
    lessons = await db.lessons.find({"unit_id": uid, "user_id": user["user_id"]}, {"_id": 0}).sort("order", 1).to_list(500)
    return lessons


@api.get("/lessons/{lid}")
async def get_lesson(lid: str, user=Depends(get_current_user)):
    l = await db.lessons.find_one({"lesson_id": lid, "user_id": user["user_id"]}, {"_id": 0})
    if not l:
        raise HTTPException(404, "Lesson not found")
    return l


@api.post("/lessons")
async def create_lesson(body: LessonIn, user=Depends(get_current_user)):
    unit = await db.units.find_one({"unit_id": body.unit_id, "user_id": user["user_id"]}, {"_id": 0})
    if not unit:
        raise HTTPException(404, "Unit not found")
    lid = f"lsn_{uuid.uuid4().hex[:12]}"
    doc = {
        "lesson_id": lid,
        "user_id": user["user_id"],
        "subject_id": unit["subject_id"],
        "unit_id": body.unit_id,
        "title": body.title,
        "notes": body.notes,
        "order": body.order,
        "status": "not_started",
        "last_studied_at": None,
        "total_seconds": 0,
        "created_at": now_iso(),
    }
    await db.lessons.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/lessons/{lid}")
async def patch_lesson(lid: str, body: LessonPatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.lessons.update_one({"lesson_id": lid, "user_id": user["user_id"]}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Lesson not found")
    # If marked done and no review exists yet, schedule one for tomorrow
    if updates.get("status") == "done":
        existing = await db.reviews.find_one({"lesson_id": lid, "user_id": user["user_id"]})
        if not existing:
            next_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
            await db.reviews.insert_one({
                "review_id": f"rvw_{uuid.uuid4().hex[:12]}",
                "user_id": user["user_id"],
                "lesson_id": lid,
                "interval_days": 1,
                "step_index": 0,
                "next_review_at": next_at,
                "last_reviewed_at": None,
                "created_at": now_iso(),
            })
    return await db.lessons.find_one({"lesson_id": lid}, {"_id": 0})


@api.delete("/lessons/{lid}")
async def delete_lesson(lid: str, user=Depends(get_current_user)):
    await db.lessons.delete_one({"lesson_id": lid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Notebooks ----------
@api.get("/notebooks")
async def list_notebooks(user=Depends(get_current_user)):
    items = await db.notebooks.find({"user_id": user["user_id"]}, {"_id": 0, "content": 0}).sort("updated_at", -1).to_list(500)
    return items


@api.get("/notebooks/{nid}")
async def get_notebook(nid: str, user=Depends(get_current_user)):
    nb = await db.notebooks.find_one({"notebook_id": nid, "user_id": user["user_id"]}, {"_id": 0})
    if not nb:
        raise HTTPException(404, "Notebook not found")
    return nb


@api.post("/notebooks")
async def create_notebook(body: NotebookIn, user=Depends(get_current_user)):
    nid = f"nb_{uuid.uuid4().hex[:12]}"
    doc = {"notebook_id": nid, "user_id": user["user_id"], **body.model_dump(), "created_at": now_iso(), "updated_at": now_iso()}
    await db.notebooks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/notebooks/{nid}")
async def patch_notebook(nid: str, body: NotebookPatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    updates["updated_at"] = now_iso()
    r = await db.notebooks.update_one({"notebook_id": nid, "user_id": user["user_id"]}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Notebook not found")
    return await db.notebooks.find_one({"notebook_id": nid}, {"_id": 0})


@api.delete("/notebooks/{nid}")
async def delete_notebook(nid: str, user=Depends(get_current_user)):
    await db.notebooks.delete_one({"notebook_id": nid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Tasks ----------
@api.get("/tasks")
async def list_tasks(user=Depends(get_current_user)):
    items = await db.tasks.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items


@api.post("/tasks")
async def create_task(body: TaskIn, user=Depends(get_current_user)):
    tid = f"tsk_{uuid.uuid4().hex[:12]}"
    doc = {"task_id": tid, "user_id": user["user_id"], **body.model_dump(), "completed": False, "created_at": now_iso()}
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/tasks/{tid}")
async def patch_task(tid: str, body: TaskPatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates.get("completed") is True:
        updates["completed_at"] = now_iso()
    r = await db.tasks.update_one({"task_id": tid, "user_id": user["user_id"]}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Task not found")
    return await db.tasks.find_one({"task_id": tid}, {"_id": 0})


@api.delete("/tasks/{tid}")
async def delete_task(tid: str, user=Depends(get_current_user)):
    await db.tasks.delete_one({"task_id": tid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Study Sessions (auto-updates lesson, streak) ----------
async def _update_streak(user_id: str, day: str):
    """Update user's streak based on activity on `day` (YYYY-MM-DD)."""
    streak = await db.streaks.find_one({"user_id": user_id}, {"_id": 0})
    if not streak:
        streak = {"user_id": user_id, "current": 1, "longest": 1, "last_day": day}
        await db.streaks.insert_one(streak)
        return streak
    if streak["last_day"] == day:
        return streak
    prev = datetime.fromisoformat(streak["last_day"]).date()
    today = datetime.fromisoformat(day).date()
    delta = (today - prev).days
    if delta == 1:
        current = streak["current"] + 1
    elif delta > 1:
        current = 1
    else:
        current = streak["current"]
    longest = max(streak["longest"], current)
    await db.streaks.update_one({"user_id": user_id}, {"$set": {"current": current, "longest": longest, "last_day": day}})
    return {"user_id": user_id, "current": current, "longest": longest, "last_day": day}


@api.get("/sessions")
async def list_sessions(user=Depends(get_current_user), limit: int = 50):
    items = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).sort("started_at", -1).to_list(limit)
    return items


@api.post("/sessions")
async def create_session(body: SessionIn, user=Depends(get_current_user)):
    sid = f"ses_{uuid.uuid4().hex[:12]}"
    started_at = body.started_at
    doc = {
        "session_id": sid,
        "user_id": user["user_id"],
        "subject_id": body.subject_id,
        "lesson_id": body.lesson_id,
        "duration_seconds": max(0, int(body.duration_seconds)),
        "mode": body.mode,
        "started_at": started_at,
        "note": body.note,
        "created_at": now_iso(),
    }
    await db.sessions.insert_one(doc)

    # Domain auto-bookkeeping: bump lesson totals, update streak, log activity day
    if body.lesson_id:
        await db.lessons.update_one(
            {"lesson_id": body.lesson_id, "user_id": user["user_id"]},
            {"$inc": {"total_seconds": doc["duration_seconds"]},
             "$set": {"last_studied_at": now_iso(),
                      "status": "in_progress"}},
        )
    tz_off = user.get("timezone_offset_min") or 0
    # started_at is ISO string; derive day in user's local time
    try:
        started_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    except Exception:
        started_dt = datetime.now(timezone.utc)
    local = started_dt.astimezone(timezone.utc) + timedelta(minutes=tz_off)
    day = local.date().isoformat()
    await _update_streak(user["user_id"], day)
    doc.pop("_id", None)
    return doc


# ---------- Today (aggregate) ----------
@api.get("/today")
async def today_view(user=Depends(get_current_user)):
    tz_off = user.get("timezone_offset_min") or 0
    today = today_str(tz_off)
    now = datetime.now(timezone.utc)
    start_iso = (now - timedelta(days=1)).isoformat()

    # Tasks due today or overdue and not done
    tasks = await db.tasks.find({
        "user_id": user["user_id"],
        "completed": False,
    }, {"_id": 0}).to_list(1000)
    todays_tasks = [t for t in tasks if (t.get("due_date") or "") <= today][:20]

    # Sessions today
    sessions = await db.sessions.find({
        "user_id": user["user_id"],
    }, {"_id": 0}).sort("started_at", -1).to_list(200)
    today_sessions = []
    seconds_today = 0
    for s in sessions:
        try:
            dt = datetime.fromisoformat(s["started_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        local = dt.astimezone(timezone.utc) + timedelta(minutes=tz_off)
        if local.date().isoformat() == today:
            today_sessions.append(s)
            seconds_today += s.get("duration_seconds", 0)

    streak = await db.streaks.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {"current": 0, "longest": 0, "last_day": None}
    subjects = await db.subjects.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)

    # Today's timetable entries
    dow = ((now + timedelta(minutes=tz_off)).weekday())  # 0=Mon
    timetable = await db.timetable.find(
        {"user_id": user["user_id"], "day_of_week": dow},
        {"_id": 0},
    ).sort("start_time", 1).to_list(50)

    # Reviews due today or earlier
    end_of_day = (datetime.now(timezone.utc) + timedelta(minutes=tz_off))
    end_of_day = end_of_day.replace(hour=23, minute=59, second=59, microsecond=0).astimezone(timezone.utc)
    due = await db.reviews.find(
        {"user_id": user["user_id"], "next_review_at": {"$lte": end_of_day.isoformat()}},
        {"_id": 0},
    ).sort("next_review_at", 1).to_list(50)
    # attach lesson info
    if due:
        ids = [r["lesson_id"] for r in due]
        lessons = await db.lessons.find({"lesson_id": {"$in": ids}}, {"_id": 0}).to_list(200)
        lesson_map = {l["lesson_id"]: l for l in lessons}
        for r in due:
            l = lesson_map.get(r["lesson_id"])
            r["lesson_title"] = l["title"] if l else "Lesson"
            r["subject_id"] = l["subject_id"] if l else None

    return {
        "today": today,
        "seconds_today": seconds_today,
        "tasks": todays_tasks,
        "sessions": today_sessions,
        "streak": streak,
        "subjects_count": len(subjects),
        "timetable": timetable,
        "reviews_due": due,
        "daily_goal_minutes": user.get("daily_goal_minutes") or 60,
    }


# ---------- Analytics ----------
@api.get("/analytics")
async def analytics(user=Depends(get_current_user)):
    tz_off = user.get("timezone_offset_min") or 0
    sessions = await db.sessions.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(5000)
    subjects = await db.subjects.find({"user_id": user["user_id"]}, {"_id": 0}).to_list(50)
    sub_map = {s["subject_id"]: s for s in subjects}

    by_day: Dict[str, int] = {}
    by_subject: Dict[str, int] = {}
    total = 0
    for s in sessions:
        try:
            dt = datetime.fromisoformat(s["started_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        local = dt.astimezone(timezone.utc) + timedelta(minutes=tz_off)
        day = local.date().isoformat()
        by_day[day] = by_day.get(day, 0) + s.get("duration_seconds", 0)
        if s.get("subject_id"):
            by_subject[s["subject_id"]] = by_subject.get(s["subject_id"], 0) + s.get("duration_seconds", 0)
        total += s.get("duration_seconds", 0)

    # last 14 days
    today = datetime.now(timezone.utc) + timedelta(minutes=tz_off)
    daily = []
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).date().isoformat()
        daily.append({"day": d, "seconds": by_day.get(d, 0)})
    subject_series = [
        {
            "subject_id": sid,
            "name": sub_map.get(sid, {}).get("name", "Unknown"),
            "color": sub_map.get(sid, {}).get("color", "slate"),
            "seconds": secs,
        }
        for sid, secs in sorted(by_subject.items(), key=lambda x: -x[1])
    ]
    streak = await db.streaks.find_one({"user_id": user["user_id"]}, {"_id": 0}) or {"current": 0, "longest": 0}
    return {"total_seconds": total, "daily": daily, "by_subject": subject_series, "streak": streak}


# ---------- Seed demo data ----------
async def _seed_demo_content(user_id: str):
    # Ensure timetable exists (idempotent add for pre-existing demo users)
    have_subjects = await db.subjects.count_documents({"user_id": user_id})
    if have_subjects and await db.timetable.count_documents({"user_id": user_id}) == 0:
        subs = await db.subjects.find({"user_id": user_id}, {"_id": 0}).to_list(50)
        today_dow = datetime.now(timezone.utc).weekday()
        if len(subs) >= 3:
            tt = [
                (today_dow, "09:00", "10:30", subs[0]["subject_id"], "Math class", "class"),
                (today_dow, "14:00", "15:00", subs[2]["subject_id"], "Biology study block", "study"),
                ((today_dow + 1) % 7, "11:00", "12:30", subs[1]["subject_id"], "Literature seminar", "class"),
            ]
            for dow, s, e, sid, title, kind in tt:
                await db.timetable.insert_one({
                    "timetable_id": f"tt_{uuid.uuid4().hex[:12]}", "user_id": user_id,
                    "title": title, "subject_id": sid, "day_of_week": dow,
                    "start_time": s, "end_time": e, "location": "", "kind": kind,
                    "created_at": now_iso(),
                })
    # Only seed the rest if user has zero subjects
    if have_subjects:
        return
    subjects_spec = [
        ("Mathematics", "dusty_blue"),
        ("Literature", "ochre"),
        ("Biology", "sage"),
        ("History", "rosewood"),
    ]
    subs = []
    for name, color in subjects_spec:
        sid = f"sub_{uuid.uuid4().hex[:12]}"
        s = {"subject_id": sid, "user_id": user_id, "name": name, "color": color, "description": "", "created_at": now_iso()}
        subs.append(s)
    await db.subjects.insert_many(subs)

    unit_titles = {
        "Mathematics": ["Algebra basics", "Linear equations", "Quadratics"],
        "Literature": ["Poetry forms", "Short stories", "Essay writing"],
        "Biology": ["Cell structure", "Genetics", "Ecosystems"],
        "History": ["Ancient world", "Medieval Europe", "Modern era"],
    }
    lesson_titles = {
        "Algebra basics": ["Numbers and variables", "Expressions", "Solving simple equations"],
        "Linear equations": ["Slope and intercept", "Graphing lines", "Systems of equations"],
        "Quadratics": ["Factoring", "The quadratic formula", "Parabolas"],
        "Poetry forms": ["Sonnets", "Free verse", "Haiku"],
        "Short stories": ["Plot structure", "Point of view", "Setting"],
        "Essay writing": ["Thesis statements", "Body paragraphs", "Conclusions"],
        "Cell structure": ["Organelles", "Membrane transport", "Cell division"],
        "Genetics": ["Mendel's laws", "DNA and RNA", "Inheritance"],
        "Ecosystems": ["Food webs", "Biomes", "Conservation"],
        "Ancient world": ["Egypt", "Greece", "Rome"],
        "Medieval Europe": ["Feudalism", "The Crusades", "The Black Death"],
        "Modern era": ["Enlightenment", "Industrial revolution", "World wars"],
    }

    units_docs = []
    lessons_docs = []
    for s in subs:
        for oi, uname in enumerate(unit_titles[s["name"]]):
            uid = f"unt_{uuid.uuid4().hex[:12]}"
            units_docs.append({
                "unit_id": uid, "user_id": user_id, "subject_id": s["subject_id"],
                "name": uname, "description": "", "order": oi, "created_at": now_iso(),
            })
            for oj, ltitle in enumerate(lesson_titles.get(uname, [])):
                lessons_docs.append({
                    "lesson_id": f"lsn_{uuid.uuid4().hex[:12]}",
                    "user_id": user_id, "subject_id": s["subject_id"], "unit_id": uid,
                    "title": ltitle, "notes": "", "order": oj, "status": "not_started",
                    "last_studied_at": None, "total_seconds": 0, "created_at": now_iso(),
                })
    if units_docs:
        await db.units.insert_many(units_docs)
    if lessons_docs:
        await db.lessons.insert_many(lessons_docs)

    # Tasks
    tasks_docs = []
    today = datetime.now(timezone.utc).date()
    tspec = [
        ("Read chapter 4 of the Biology text", subs[2]["subject_id"], "high", 0),
        ("Finish algebra problem set", subs[0]["subject_id"], "normal", 1),
        ("Draft an essay outline on the Enlightenment", subs[3]["subject_id"], "normal", 2),
        ("Memorise a Shakespeare sonnet", subs[1]["subject_id"], "low", 3),
        ("Review genetics vocabulary", subs[2]["subject_id"], "normal", -1),
    ]
    for title, sid, pri, offset in tspec:
        tasks_docs.append({
            "task_id": f"tsk_{uuid.uuid4().hex[:12]}",
            "user_id": user_id, "title": title, "subject_id": sid,
            "due_date": (today + timedelta(days=offset)).isoformat(),
            "priority": pri, "notes": "", "completed": False, "created_at": now_iso(),
        })
    await db.tasks.insert_many(tasks_docs)

    # Notebooks
    nbs = [
        {"title": "Reading log", "subject_id": subs[1]["subject_id"], "content": "A calm place for what I read and what I noticed."},
        {"title": "Math practice", "subject_id": subs[0]["subject_id"], "content": "Track worked problems here."},
        {"title": "Ideas and questions", "subject_id": None, "content": "Anything on my mind worth returning to."},
    ]
    for n in nbs:
        await db.notebooks.insert_one({
            "notebook_id": f"nb_{uuid.uuid4().hex[:12]}", "user_id": user_id,
            **n, "created_at": now_iso(), "updated_at": now_iso(),
        })

    # A few past sessions across the last 7 days
    ses_docs = []
    for i in range(0, 7):
        started = datetime.now(timezone.utc) - timedelta(days=i, hours=2)
        ses_docs.append({
            "session_id": f"ses_{uuid.uuid4().hex[:12]}",
            "user_id": user_id,
            "subject_id": subs[i % 4]["subject_id"],
            "lesson_id": None,
            "duration_seconds": (25 + (i * 5)) * 60,
            "mode": "pomodoro",
            "started_at": started.isoformat(),
            "note": "",
            "created_at": now_iso(),
        })
    await db.sessions.insert_many(ses_docs)

    # Streak
    await db.streaks.insert_one({
        "user_id": user_id, "current": 3, "longest": 5,
        "last_day": datetime.now(timezone.utc).date().isoformat(),
    })

    # Timetable: a small weekly schedule
    today_dow = datetime.now(timezone.utc).weekday()
    tt = [
        (today_dow, "09:00", "10:30", subs[0]["subject_id"], "Math class", "class"),
        (today_dow, "14:00", "15:00", subs[2]["subject_id"], "Biology study block", "study"),
        ((today_dow + 1) % 7, "11:00", "12:30", subs[1]["subject_id"], "Literature seminar", "class"),
    ]
    for dow, s, e, sid, title, kind in tt:
        await db.timetable.insert_one({
            "timetable_id": f"tt_{uuid.uuid4().hex[:12]}", "user_id": user_id,
            "title": title, "subject_id": sid, "day_of_week": dow,
            "start_time": s, "end_time": e, "location": "", "kind": kind,
            "created_at": now_iso(),
        })


@api.post("/seed")
async def seed_endpoint(user=Depends(get_current_user)):
    await _seed_demo_content(user["user_id"])
    return {"ok": True}


# ---------- Timetable ----------
@api.get("/timetable")
async def list_timetable(user=Depends(get_current_user)):
    items = await db.timetable.find({"user_id": user["user_id"]}, {"_id": 0}).sort([("day_of_week", 1), ("start_time", 1)]).to_list(500)
    return items


@api.post("/timetable")
async def create_timetable(body: TimetableIn, user=Depends(get_current_user)):
    tid = f"tt_{uuid.uuid4().hex[:12]}"
    doc = {"timetable_id": tid, "user_id": user["user_id"], **body.model_dump(), "created_at": now_iso()}
    await db.timetable.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/timetable/{tid}")
async def patch_timetable(tid: str, body: TimetablePatch, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    r = await db.timetable.update_one({"timetable_id": tid, "user_id": user["user_id"]}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(404, "Block not found")
    return await db.timetable.find_one({"timetable_id": tid}, {"_id": 0})


@api.delete("/timetable/{tid}")
async def delete_timetable(tid: str, user=Depends(get_current_user)):
    await db.timetable.delete_one({"timetable_id": tid, "user_id": user["user_id"]})
    return {"ok": True}


# ---------- Reviews (spaced repetition) ----------
# Interval ladder in days. `good` advances one step; `again` resets to step 0.
_REVIEW_STEPS = [1, 3, 7, 14, 30, 60, 120]


@api.get("/reviews")
async def list_reviews(user=Depends(get_current_user), due_only: bool = False):
    q = {"user_id": user["user_id"]}
    if due_only:
        q["next_review_at"] = {"$lte": now_iso()}
    items = await db.reviews.find(q, {"_id": 0}).sort("next_review_at", 1).to_list(500)
    if items:
        ids = [r["lesson_id"] for r in items]
        lessons = await db.lessons.find({"lesson_id": {"$in": ids}}, {"_id": 0}).to_list(500)
        lesson_map = {l["lesson_id"]: l for l in lessons}
        for r in items:
            l = lesson_map.get(r["lesson_id"])
            r["lesson_title"] = l["title"] if l else "Lesson"
            r["subject_id"] = l["subject_id"] if l else None
    return items


@api.post("/reviews/{rid}/mark")
async def mark_review(rid: str, body: ReviewOutcome, user=Depends(get_current_user)):
    review = await db.reviews.find_one({"review_id": rid, "user_id": user["user_id"]})
    if not review:
        raise HTTPException(404, "Review not found")
    step = int(review.get("step_index", 0))
    if body.quality == "again":
        step = 0
    else:
        step = min(step + 1, len(_REVIEW_STEPS) - 1)
    interval = _REVIEW_STEPS[step]
    next_at = (datetime.now(timezone.utc) + timedelta(days=interval)).isoformat()
    await db.reviews.update_one({"review_id": rid}, {"$set": {
        "step_index": step,
        "interval_days": interval,
        "next_review_at": next_at,
        "last_reviewed_at": now_iso(),
    }})
    return await db.reviews.find_one({"review_id": rid}, {"_id": 0})


# ---------- Global search ----------
@api.get("/search")
async def search(q: str, user=Depends(get_current_user)):
    q = (q or "").strip()
    if len(q) < 1:
        return {"subjects": [], "lessons": [], "notebooks": [], "tasks": []}
    import re
    rx = {"$regex": re.escape(q), "$options": "i"}
    subjects = await db.subjects.find({"user_id": user["user_id"], "name": rx}, {"_id": 0}).limit(8).to_list(8)
    lessons = await db.lessons.find({"user_id": user["user_id"], "title": rx}, {"_id": 0}).limit(10).to_list(10)
    notebooks = await db.notebooks.find(
        {"user_id": user["user_id"], "$or": [{"title": rx}, {"content": rx}]},
        {"_id": 0, "content": 0},
    ).limit(10).to_list(10)
    tasks = await db.tasks.find({"user_id": user["user_id"], "title": rx}, {"_id": 0}).limit(10).to_list(10)
    return {"subjects": subjects, "lessons": lessons, "notebooks": notebooks, "tasks": tasks}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.subjects.create_index([("user_id", 1)])
    await db.units.create_index([("user_id", 1), ("subject_id", 1)])
    await db.lessons.create_index([("user_id", 1), ("unit_id", 1)])
    await db.tasks.create_index([("user_id", 1)])
    await db.notebooks.create_index([("user_id", 1)])
    await db.sessions.create_index([("user_id", 1), ("started_at", -1)])
    await db.streaks.create_index("user_id", unique=True)
    await db.timetable.create_index([("user_id", 1), ("day_of_week", 1)])
    await db.reviews.create_index([("user_id", 1), ("next_review_at", 1)])

    # Seed demo user
    demo_email = os.environ.get("DEMO_EMAIL", "demo@syllo.app")
    demo_pw = os.environ.get("DEMO_PASSWORD", "syllo123")
    existing = await db.users.find_one({"email": demo_email})
    if not existing:
        user_id = f"user_{uuid.uuid4().hex[:16]}"
        await db.users.insert_one({
            "user_id": user_id, "email": demo_email, "name": "Demo Student",
            "picture": None, "auth_provider": "password",
            "password_hash": hash_password(demo_pw),
            "onboarded": True, "theme": "light", "timezone_offset_min": 0,
            "created_at": now_iso(),
        })
        await _seed_demo_content(user_id)
        log.info("Seeded demo user %s", demo_email)
    else:
        await _seed_demo_content(existing["user_id"])


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)

_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
