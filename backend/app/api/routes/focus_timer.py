from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4, uuid5

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject
from backend.app.api.routes.sessions import record_study_session, session_dict, utc_value
from backend.app.database import get_session
from backend.app.models import FocusTimer, FocusTimerRequest, Lesson, Unit, User
from backend.app.models import base
from backend.app.schemas.academics import StudySessionCreate
from backend.app.services.study import lock_student

router = APIRouter(tags=["focus"])


class TimerAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["start", "pause", "resume", "reset", "finish"]
    expected_revision: int = Field(ge=0)
    request_id: UUID
    mode: Literal["pomodoro", "short", "long", "stopwatch"] | None = None
    duration_seconds: int | None = Field(default=None, ge=0, le=14400)
    subject_id: str | None = None
    unit_id: str | None = None
    lesson_id: str | None = None
    circle_event_id: str | None = None


async def locked_timer(session, user):
    # The user lock also serializes first creation, when no timer row exists yet.
    await lock_student(session, user.user_id)
    item = await session.scalar(select(FocusTimer).where(FocusTimer.user_id == user.user_id).with_for_update().execution_options(populate_existing=True))
    if item is None:
        item = FocusTimer(user_id=user.user_id, revision=0)
        session.add(item)
        await session.flush()
    return item


def elapsed(timer, now):
    seconds = timer["elapsed_seconds"]
    if timer["status"] == "running":
        seconds += max(0.0, (now - datetime.fromisoformat(timer["run_started_at"])).total_seconds())
    return seconds if timer["mode"] == "stopwatch" else min(seconds, timer["duration_seconds"])


def envelope(item, now, received_at):
    timer = deepcopy(item.timer)
    if timer:
        timer["elapsed_seconds"] = elapsed(timer, now)
        timer.pop("run_started_at", None)
    return {"revision": item.revision, "server_now": now.isoformat(), "server_received_at": received_at.isoformat(), "timer": timer,
        "last_session": (item.completion or {}).get("last_session"),
        "completed_timer_id": (item.completion or {}).get("timer_id"),
        "finished_duration_seconds": (item.completion or {}).get("duration_seconds")}


async def finish_timer(session, user, item, now, *, automatic=False):
    timer = item.timer
    total = int(elapsed(timer, now))
    is_break = timer["mode"] in ("short", "long")
    if total < 10 and not is_break and not automatic:
        raise HTTPException(422, "A session needs at least 10 seconds.")
    last = None
    if not is_break and total:
        # Academic entries may have been deleted while the browser was closed.
        lesson = await session.scalar(select(Lesson).where(Lesson.user_id == user.user_id, Lesson.lesson_id == timer["lesson_id"])) if timer["lesson_id"] else None
        subject_id = timer["subject_id"]
        if subject_id:
            try:
                await owned_subject(session, user.user_id, subject_id)
            except HTTPException as error:
                if error.status_code != 404:
                    raise
                subject_id = None
        event_id = timer["circle_event_id"]
        if event_id:
            from backend.app.services.circle_scheduling import validate_recorded_event
            try:
                await validate_recorded_event(session, user, event_id)
            except HTTPException as error:
                if error.status_code not in (400, 403, 404, 409, 422):
                    raise
                event_id = None
        original_start = datetime.fromisoformat(timer["started_at"])
        # Time spent paused affects the actual finish timestamp, but not study time.
        finish_at = now
        if automatic:
            finish_at = datetime.fromisoformat(timer["run_started_at"]) + timedelta(seconds=timer["duration_seconds"] - timer["elapsed_seconds"])
        offset = 0
        while offset < total:
            duration = min(86400, total - offset)
            body = StudySessionCreate(request_id=uuid5(UUID(timer["timer_id"]), str(offset)), subject_id=subject_id,
                lesson_id=lesson.lesson_id if lesson else None, circle_event_id=event_id,
                duration_seconds=duration, mode=timer["mode"], started_at=original_start + timedelta(seconds=offset), note="")
            last = await record_study_session(session, user, body, commit=False)
            last.finished_at = utc_value(finish_at).replace(microsecond=0) if offset + duration == total else utc_value(original_start + timedelta(seconds=offset + duration)).replace(microsecond=0)
            offset += duration
    await session.flush()
    item.completion = {"timer_id": timer["timer_id"], "duration_seconds": total, "last_session": session_dict(last) if last else None}
    item.timer = None
    item.revision += 1


async def expire_timer(session, user, item, now):
    timer = item.timer
    if timer and timer["status"] == "running" and timer["mode"] != "stopwatch" and elapsed(timer, now) >= timer["duration_seconds"]:
        await finish_timer(session, user, item, now, automatic=True)


@router.get("/focus-timer")
async def get_timer(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    received_at = base.utc_now()
    item = await locked_timer(session, user)
    now = base.utc_now()
    await expire_timer(session, user, item, now)
    await session.commit()
    return envelope(item, base.utc_now(), received_at)


@router.post("/focus-timer/action")
async def timer_action(body: TimerAction, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    received_at = base.utc_now()
    item = await locked_timer(session, user)
    payload = body.model_dump(mode="json")
    previous = await session.get(FocusTimerRequest, (user.user_id, str(body.request_id)))
    now = base.utc_now()
    if previous:
        if previous.payload != payload:
            raise HTTPException(409, "This timer request was already used for another action.")
        await expire_timer(session, user, item, now)
        await session.commit()
        return envelope(item, base.utc_now(), received_at)
    await expire_timer(session, user, item, now)
    if item.revision != body.expected_revision:
        await session.commit()  # Persist a completion discovered by this request.
        raise HTTPException(409, "The timer changed on another device. Refresh before trying again.")
    timer = deepcopy(item.timer)
    if body.action == "start":
        if timer:
            raise HTTPException(409, "A timer is already active. Resume or finish it first.")
        if body.mode is None:
            raise HTTPException(422, "Choose a timer mode.")
        duration = 0 if body.mode == "stopwatch" else body.duration_seconds
        if body.mode != "stopwatch" and (duration is None or duration < 10):
            raise HTTPException(422, "Choose a duration between 10 seconds and 240 minutes.")
        lesson = await owned_lesson(session, user.user_id, body.lesson_id) if body.lesson_id else None
        subject_id = body.subject_id
        unit_id = body.unit_id
        if subject_id:
            await owned_subject(session, user.user_id, subject_id)
        if unit_id:
            unit = await session.scalar(select(Unit).where(Unit.unit_id == unit_id, Unit.user_id == user.user_id))
            if not unit:
                raise HTTPException(404, "Unit not found")
            if subject_id and unit.subject_id != subject_id:
                raise HTTPException(422, "Unit does not belong to subject")
            subject_id = unit.subject_id
        if lesson:
            if subject_id and lesson.subject_id != subject_id or unit_id and lesson.unit_id != unit_id:
                raise HTTPException(422, "Lesson does not belong to the chosen subject or unit")
            subject_id, unit_id = lesson.subject_id, lesson.unit_id
        event_topic = ""
        if body.circle_event_id:
            from backend.app.services.circle_scheduling import validate_recorded_event
            from backend.app.models import CircleStudyEvent
            await validate_recorded_event(session, user, body.circle_event_id)
            event = await session.get(CircleStudyEvent, body.circle_event_id)
            event_topic = event.topic
        timer = {"timer_id": str(uuid4()), "mode": body.mode, "duration_seconds": duration, "status": "running",
            "elapsed_seconds": 0.0, "started_at": now.isoformat(), "run_started_at": now.isoformat(),
            "subject_id": subject_id, "unit_id": unit_id, "lesson_id": lesson.lesson_id if lesson else None,
            "lesson_title": lesson.title if lesson else "", "circle_event_id": body.circle_event_id, "event_topic": event_topic}
        item.completion = None
    elif body.action == "reset":
        timer = None
        item.completion = None
    elif not timer:
        raise HTTPException(409, "There is no active timer. Refresh to see the latest state.")
    elif body.action == "pause":
        if timer["status"] != "running":
            raise HTTPException(409, "This timer is already paused.")
        timer["elapsed_seconds"] = elapsed(timer, now)
        timer["status"] = "paused"
        timer["run_started_at"] = None
    elif body.action == "resume":
        if timer["status"] != "paused":
            raise HTTPException(409, "This timer is already running.")
        timer["status"] = "running"
        timer["run_started_at"] = now.isoformat()
    elif body.action == "finish":
        await finish_timer(session, user, item, now)
    if body.action != "finish":
        item.timer = timer
        item.revision += 1
    session.add(FocusTimerRequest(user_id=user.user_id, request_id=str(body.request_id), payload=payload))
    await session.commit()
    return envelope(item, base.utc_now(), received_at)
