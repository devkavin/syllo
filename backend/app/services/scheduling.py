"""Timezone-aware private planning. Circle responses expose slots, not these items."""
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import HTTPException
from sqlalchemy import select
from backend.app.models import Review, Task, TimetableEntry, User, CircleStudyEvent, CircleParticipation, CircleMember, AvailabilityExclusion


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def user_timezone(user):
    return ZoneInfo(user.timezone) if user.timezone else timezone(timedelta(minutes=user.timezone_offset_min))


def resolve_local_time(user, day, clock, utc_offset_minutes=None, recurring=False):
    naive = datetime.combine(day, time.fromisoformat(clock))
    zone = user_timezone(user)
    candidates = []
    for fold in (0, 1):
        aware = naive.replace(tzinfo=zone, fold=fold)
        candidate = aware.astimezone(timezone.utc)
        if candidate.astimezone(zone).replace(tzinfo=None) == naive and candidate not in [c[0] for c in candidates]: candidates.append((candidate, int(aware.utcoffset().total_seconds() / 60)))
    if utc_offset_minutes is not None: candidates = [c for c in candidates if c[1] == utc_offset_minutes]
    if not candidates: raise HTTPException(422, "This local time does not exist or its UTC offset does not match. Choose another time.")
    if len(candidates) > 1 and not recurring: raise HTTPException(422, "This time occurs twice because clocks change. Select an explicit UTC offset.")
    return candidates[0][0]


async def lock_schedule_users(session, user_ids):
    for user_id in sorted(set(user_ids)):
        await session.scalar(select(User).where(User.user_id == user_id).with_for_update().execution_options(populate_existing=True))


def overlap(a, b, c, d):
    return a < d and c < b


def expand_timetable(rows, user, start, end):
    result, warnings = [], []
    first = start.astimezone(user_timezone(user)).date() - timedelta(days=1)
    last = end.astimezone(user_timezone(user)).date()
    for row in rows:
        if row.recurrence == "none":
            if not row.starts_at or not row.ends_at:
                warnings.append({"id": row.timetable_id, "message": "Add a date to this one-off plan.", "href": f"/timetable?edit={row.timetable_id}"}); continue
            a, b = utc(row.starts_at), utc(row.ends_at)
            if overlap(start, end, a, b): result.append((a, b, row))
            continue
        day = first
        while day <= last:
            if day.weekday() == row.day_of_week:
                try:
                    a = resolve_local_time(user, day, row.start_time, recurring=True)
                    b = resolve_local_time(user, day, row.end_time, recurring=True)
                    if b > a and overlap(start, end, a, b): result.append((a, b, row))
                except HTTPException:
                    warnings.append({"id": row.timetable_id, "message": "A class falls in a clock-change gap. Check its time.", "href": "/timetable"})
            day += timedelta(days=1)
    return result, warnings


async def timetable_intervals(session, user, start, end):
    rows = (await session.scalars(select(TimetableEntry).where(TimetableEntry.user_id == user.user_id))).all()
    return expand_timetable(rows, user, start, end)


async def accepted_events(session, user_ids, start, end, current=False):
    query = select(CircleStudyEvent, CircleParticipation).join(CircleParticipation).join(CircleMember, (CircleMember.circle_id == CircleStudyEvent.circle_id) & (CircleMember.user_id == CircleParticipation.user_id)).where(CircleParticipation.user_id.in_(user_ids), CircleParticipation.status == "accepted", CircleParticipation.accepted_revision == CircleStudyEvent.revision, CircleStudyEvent.canceled.is_(False), CircleStudyEvent.starts_at < end, CircleStudyEvent.ends_at > start)
    if current: query = query.with_for_update().execution_options(populate_existing=True)
    return (await session.execute(query)).all()


async def busy_by_user(session, users, start, end, exclude_event=None):
    ids = [u.user_id for u in users]
    rows = (await session.scalars(select(TimetableEntry).where(TimetableEntry.user_id.in_(ids)).with_for_update().execution_options(populate_existing=True))).all()
    exclusions = (await session.scalars(select(AvailabilityExclusion).where(AvailabilityExclusion.user_id.in_(ids), AvailabilityExclusion.starts_at < end, AvailabilityExclusion.ends_at > start).with_for_update())).all()
    result = {u.user_id: [(a, b) for a, b, _ in expand_timetable([r for r in rows if r.user_id == u.user_id], u, start, end)[0]] for u in users}
    for e in exclusions: result[e.user_id].append((utc(e.starts_at), utc(e.ends_at)))
    for event, p in await accepted_events(session, ids, start, end, current=True):
        if event.id != exclude_event: result[p.user_id].append((utc(event.starts_at), utc(event.ends_at)))
    return result


async def busy_intervals(session, user, start, end):
    return (await busy_by_user(session, [user], start, end))[user.user_id]


async def build_agenda(session, user, start, end):
    blocks, warnings = await timetable_intervals(session, user, start, end)
    items = [{"id": r.timetable_id, "source": "timetable", "kind": r.kind, "title": r.title, "starts_at": a.isoformat(), "ends_at": b.isoformat(), "subject_id": r.subject_id, "lesson_id": None, "href": f"/timetable?edit={r.timetable_id}"} for a, b, r in blocks]
    zone = user_timezone(user)
    tasks = (await session.scalars(select(Task).where(Task.user_id == user.user_id, Task.completed.is_(False), Task.due_date >= start.astimezone(zone).date(), Task.due_date <= end.astimezone(zone).date()))).all()
    for task in tasks:
        try: a = resolve_local_time(user, task.due_date, task.due_time or "23:59", recurring=True)
        except (HTTPException, ValueError): continue
        if start <= a < end: items.append({"id": task.task_id, "source": "task", "kind": "task", "title": task.title, "starts_at": a.isoformat(), "ends_at": None, "subject_id": task.subject_id, "lesson_id": task.lesson_id, "href": f"/tasks?task={task.task_id}"})
    reviews = (await session.scalars(select(Review).where(Review.user_id == user.user_id, Review.next_review_at >= start, Review.next_review_at < end))).all()
    from backend.app.models import Lesson
    lessons = (await session.scalars(select(Lesson).where(Lesson.user_id == user.user_id, Lesson.lesson_id.in_([r.lesson_id for r in reviews])))).all() if reviews else []
    titles = {l.lesson_id: l.title for l in lessons}
    for r in reviews: items.append({"id": r.review_id, "source": "review", "kind": "review", "title": f"Review {titles.get(r.lesson_id, 'lesson')}", "starts_at": utc(r.next_review_at).isoformat(), "ends_at": None, "subject_id": None, "lesson_id": r.lesson_id, "href": f"/lessons/{r.lesson_id}" if r.lesson_id else "/reviews"})
    for event, _ in await accepted_events(session, [user.user_id], start, end):
        items.append({"id": event.id, "source": "circle", "kind": "circle_study", "title": event.topic, "starts_at": utc(event.starts_at).isoformat(), "ends_at": utc(event.ends_at).isoformat(), "subject_id": None, "lesson_id": None, "href": f"/timer?event={event.id}"})
    return {"items": sorted(items, key=lambda i: i["starts_at"]), "warnings": warnings}


async def validate_timetable_conflicts(session, user, proposed):
    now = datetime.now(timezone.utc)
    for event, _ in await accepted_events(session, [user.user_id], now, now + timedelta(days=91), current=True):
        if expand_timetable([proposed], user, utc(event.starts_at), utc(event.ends_at))[0]:
            raise HTTPException(409, "This overlaps an accepted Circle session. Reschedule or decline that session first.")


async def validate_timezone_conflicts(session, user):
    """A profile change must not move weekly classes into an accepted session."""
    now = datetime.now(timezone.utc)
    events = await accepted_events(session, [user.user_id], now, now + timedelta(days=91), current=True)
    if not events: return
    rows = (await session.scalars(select(TimetableEntry).where(TimetableEntry.user_id == user.user_id, TimetableEntry.recurrence == "weekly").with_for_update().execution_options(populate_existing=True))).all()
    if any(expand_timetable(rows, user, utc(event.starts_at), utc(event.ends_at))[0] for event, _ in events):
        raise HTTPException(409, "This timezone moves a class into an accepted Circle session. Reschedule or decline that session first.")
