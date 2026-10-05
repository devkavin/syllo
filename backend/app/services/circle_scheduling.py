"""Deterministic, opt-in scheduling; no member calendars leave this service."""
from datetime import datetime, timedelta, timezone
from math import ceil
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.models import Circle, CircleMember, CircleStudyEvent, CircleParticipation, AvailabilityWindow, User
from backend.app.services.scheduling import lock_schedule_users, utc, resolve_local_time, user_timezone, busy_by_user, overlap


async def locked_circle(session, actor, circle_id, user_ids=()):
    await lock_schedule_users(session, [actor.user_id, *user_ids])
    circle = await session.scalar(select(Circle).where(Circle.circle_id == circle_id).with_for_update().execution_options(populate_existing=True))
    members = (await session.scalars(select(CircleMember).where(CircleMember.circle_id == circle_id).with_for_update().execution_options(populate_existing=True))).all()
    mapping = {m.user_id: m for m in members}
    if circle is None or actor.user_id not in mapping: raise HTTPException(404, "Circle not found")
    return circle, mapping


def validate_participants(actor, ids, members):
    if actor.user_id not in ids: raise HTTPException(422, "Include yourself in the session")
    if any(uid not in members for uid in ids): raise HTTPException(404, "One of the selected students is no longer in this circle")


def validate_event_time(start, end):
    now = datetime.now(timezone.utc)
    if not 15 * 60 <= (end - start).total_seconds() <= 240 * 60: raise HTTPException(422, "Choose 15 to 240 minutes")
    if start <= now or end > now + timedelta(days=90): raise HTTPException(422, "Choose a future time within 90 days")


async def check_busy(session, user, start, end, exclude_event=None):
    intervals = (await busy_by_user(session, [user], start, end, exclude_event))[user.user_id]
    if any(overlap(start, end, a, b) for a, b in intervals):
        raise HTTPException(409, "This time overlaps another commitment. Choose another time or update your plan first.")


async def suggest_slots(session, actor, circle_id, body):
    _, members = await locked_circle(session, actor, circle_id, body.participants)
    validate_participants(actor, body.participants, members)
    start, end = utc(body.start), utc(body.end)
    now = datetime.now(timezone.utc)
    if end > now + timedelta(days=90): raise HTTPException(422, "Choose a range within 90 days")
    start = max(start, now)
    unavailable = {"available": False, "slots": [], "reason": "Shared availability is not available for this group. You can still propose a time."}
    if any(not members[uid].share_availability for uid in body.participants): return unavailable
    users = (await session.scalars(select(User).where(User.user_id.in_(body.participants)).with_for_update().execution_options(populate_existing=True))).all()
    windows = (await session.scalars(select(AvailabilityWindow).where(AvailabilityWindow.user_id.in_(body.participants)).with_for_update())).all()
    if any(not any(w.user_id == uid for w in windows) for uid in body.participants): return unavailable
    free = {}
    for user in users:
        intervals = []
        day = start.astimezone(user_timezone(user)).date() - timedelta(days=1)
        last = end.astimezone(user_timezone(user)).date()
        while day <= last:
            for w in windows:
                if w.user_id == user.user_id and w.day_of_week == day.weekday():
                    try:
                        a = resolve_local_time(user, day, w.start_time, recurring=True)
                        b = resolve_local_time(user, day, w.end_time, recurring=True)
                        if overlap(start, end, a, b): intervals.append((max(a, start), min(b, end)))
                    except HTTPException: pass  # Never shift a window through a clock-change gap.
            day += timedelta(days=1)
        merged = []
        for a, b in sorted(intervals):
            if merged and a <= merged[-1][1]: merged[-1] = (merged[-1][0], max(b, merged[-1][1]))
            else: merged.append((a, b))
        free[user.user_id] = merged
    busy = await busy_by_user(session, users, start, end)
    duration = timedelta(minutes=body.duration_minutes)
    slot = datetime.fromtimestamp(ceil(start.timestamp() / 900) * 900, timezone.utc)
    slots = []
    while slot + duration <= end and len(slots) < 5:
        finish = slot + duration
        # Match recurring windows' first-occurrence policy, not two identical clocks.
        first_occurrence = all(slot.astimezone(user_timezone(user)).fold == 0 for user in users)
        if first_occurrence and all(any(a <= slot and finish <= b for a, b in free[uid]) and not any(overlap(slot, finish, a, b) for a, b in busy[uid]) for uid in body.participants): slots.append({"start": slot.isoformat(), "end": finish.isoformat()})
        slot += timedelta(minutes=15)
    return {"available": True, "slots": slots, "reason": None if slots else "No common time in this range. Try other dates or propose a time."}


async def event_view(session, event, user_id):
    parts = (await session.scalars(select(CircleParticipation).where(CircleParticipation.event_id == event.id).execution_options(populate_existing=True))).all()
    own = next((p for p in parts if p.user_id == user_id), None)
    return {"id": event.id, "circle_id": event.circle_id, "organizer_id": event.organizer_id, "topic": event.topic, "start": utc(event.starts_at).isoformat(), "end": utc(event.ends_at).isoformat(), "revision": event.revision, "canceled": event.canceled, "my_status": own.status if own else None, "participants": [{"user_id": p.user_id, "status": p.status} for p in parts]}


async def locked_event(session, actor, circle_id, event_id):
    # Participant set is immutable. Re-read event and membership after locks.
    ids = (await session.scalars(select(CircleParticipation.user_id).where(CircleParticipation.event_id == event_id))).all()
    _, members = await locked_circle(session, actor, circle_id, ids)
    event = await session.scalar(select(CircleStudyEvent).where(CircleStudyEvent.id == event_id, CircleStudyEvent.circle_id == circle_id).with_for_update().execution_options(populate_existing=True))
    if not event: raise HTTPException(404, "Session not found")
    return event, members


async def validate_recorded_event(session, actor, event_id):
    event = await session.scalar(select(CircleStudyEvent).where(CircleStudyEvent.id == event_id).with_for_update().execution_options(populate_existing=True))
    if not event: raise HTTPException(404, "Session not found")
    # Caller holds its own user lock. Only that user's participation is consulted.
    member = await session.scalar(select(CircleMember).where(CircleMember.circle_id == event.circle_id, CircleMember.user_id == actor.user_id).with_for_update())
    part = await session.scalar(select(CircleParticipation).where(CircleParticipation.event_id == event_id, CircleParticipation.user_id == actor.user_id).with_for_update().execution_options(populate_existing=True))
    if not member or not part: raise HTTPException(404, "Session not found")
    if event.canceled or part.status != "accepted" or part.accepted_revision != event.revision: raise HTTPException(409, "Confirm the current Circle session before recording study for it")
