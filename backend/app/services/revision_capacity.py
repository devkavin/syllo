"""Account-wide revision allowance shared with planned study occurrences."""

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
import hashlib
import json
import math

from fastapi import HTTPException
from sqlalchemy import select

from backend.app.models import RevisionPlan, RevisionPlanItem, Task, base
from backend.app.services.scheduling import (
    accepted_events,
    timetable_intervals,
    user_timezone,
    utc,
)

MAX_PLAN_DAYS = 730


def validate_horizon(today, end):
    if (end - today).days > MAX_PLAN_DAYS:
        raise HTTPException(422, "Choose an exam within the next two years (730 days)")


async def schedule_state(session, user, start, end, exclude_ids=()):
    validate_horizon(base.utc_now().astimezone(user_timezone(user)).date(), end)
    validate_horizon(start, end)
    rows = (
        await session.execute(
            select(Task, RevisionPlanItem, RevisionPlan)
            .join(RevisionPlanItem, RevisionPlanItem.task_id == Task.task_id)
            .join(RevisionPlan, RevisionPlan.plan_id == RevisionPlanItem.plan_id)
            .where(Task.user_id == user.user_id, RevisionPlan.user_id == user.user_id)
            .order_by(Task.task_id)
        )
    ).all()
    usage = defaultdict(int)
    for task, item, _ in rows:
        if (
            task.task_id not in exclude_ids
            and task.due_date
            and start <= task.due_date < end
        ):
            # Completed work still reserves its original place in a day's plan.
            usage[task.due_date] += item.minutes
    zone = user_timezone(user)
    begins = datetime.combine(start, time.min, zone).astimezone(timezone.utc)
    finishes = datetime.combine(end, time.min, zone).astimezone(timezone.utc)
    blocks, _ = await timetable_intervals(session, user, begins, finishes)
    occurrences = [
        (a, b, row.timetable_id, row.title)
        for a, b, row in blocks
        if row.kind == "study"
    ]
    occurrences.extend(
        (utc(event.starts_at), utc(event.ends_at), event.id, event.topic)
        for event, _ in await accepted_events(session, [user.user_id], begins, finishes)
    )
    for a, b, _, _ in occurrences:
        day = max(a.astimezone(zone).date(), start)
        while (
            day < end
            and datetime.combine(day, time.min, zone).astimezone(timezone.utc) < b
        ):
            left = max(
                a, datetime.combine(day, time.min, zone).astimezone(timezone.utc)
            )
            right = min(
                b,
                datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(
                    timezone.utc
                ),
            )
            if right > left:
                usage[day] += math.ceil((right - left).total_seconds() / 60)
            day += timedelta(days=1)
    state = {
        "tasks": [
            (
                task.task_id,
                item.plan_id,
                task.title,
                task.lesson_id,
                task.due_date.isoformat() if task.due_date else None,
                task.completed,
                utc(task.updated_at).isoformat(),
                item.minutes,
            )
            for task, item, _ in rows
        ],
        "study": sorted(
            (id_, a.isoformat(), b.isoformat(), title)
            for a, b, id_, title in occurrences
        ),
    }
    return usage, state


def fingerprint_for(plan, user, today, state):
    data = {
        "owner": user.user_id,
        "today": today.isoformat(),
        "timezone": str(user_timezone(user)),
        "plan": [
            plan.plan_id,
            plan.title,
            plan.exam_date.isoformat(),
            plan.study_days,
            plan.daily_minutes,
            plan.minutes_per_lesson,
        ],
        **state,
    }
    return hashlib.sha256(
        json.dumps(data, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def assign_day(usage, start, exam_date, study_days, allowance, minutes):
    day = start
    while day < exam_date:
        if day.weekday() in study_days and usage[day] + minutes <= allowance:
            usage[day] += minutes
            return day
        day += timedelta(days=1)
    return None


def allocate_schedule(usage, start, exam_date, study_days, allowance, demands):
    """Try selected order, then larger sessions first if small ones block a fit.

    A demand is (key, minutes, first_session_key); the last element makes
    an optional repeat start on a later day than its first session.
    """
    for ordered in (
        demands,
        sorted(demands, key=lambda item: (item[2] is not None, -item[1])),
    ):
        reserved = defaultdict(int, usage)
        dates = {}
        for key, minutes, after in ordered:
            earliest = dates[after] + timedelta(days=1) if after else start
            day = assign_day(
                reserved, earliest, exam_date, study_days, allowance, minutes
            )
            if day is None:
                break
            dates[key] = day
        else:
            return dates
    # Greedy placement can leave unusable gaps for varied durations. A bounded
    # subset-sum pass fills each allowed day without an exponential search over
    # entire plans. Minutes are integers and the daily allowance is at most1440.
    # Stop after a fixed work budget rather than blocking the API for huge plans.
    pending = {key: (minutes, after) for key, minutes, after in demands}
    dates = {}
    budget = 4_000_000
    day = start
    while day < exam_date and pending:
        capacity = max(0, allowance - usage[day])
        if day.weekday() in study_days and capacity:
            available = [
                (key, minutes)
                for key, (minutes, after) in pending.items()
                if minutes <= capacity
                and (after is None or after in dates and dates[after] < day)
            ]
            paths = [None] * (capacity + 1)
            paths[0] = ()
            for key, minutes in available:
                for filled in range(capacity - minutes, -1, -1):
                    budget -= 1
                    if budget < 0:
                        return None
                    if paths[filled] is not None and paths[filled + minutes] is None:
                        paths[filled + minutes] = (*paths[filled], key)
            best = next(
                filled
                for filled in range(capacity, -1, -1)
                if paths[filled] is not None
            )
            for key in paths[best]:
                dates[key] = day
                del pending[key]
        day += timedelta(days=1)
    return dates if not pending else None
