from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    field_validator,
    model_validator,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject
from backend.app.database import get_session
from backend.app.models import (
    RevisionPlan,
    RevisionPlanItem,
    StudyQuestion,
    Task,
    User,
    base,
)
from backend.app.services.scheduling import user_timezone
from backend.app.services.study import lock_student
from backend.app.services.revision_capacity import (
    allocate_schedule,
    fingerprint_for,
    schedule_state,
    validate_horizon,
)

router = APIRouter(prefix="/study/plans", tags=["study"])


class PlanCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=240)
    subject_id: str
    exam_date: date
    daily_minutes: int = Field(ge=1, le=1440)
    study_days: list[StrictInt] = Field(min_length=1, max_length=7)
    lesson_ids: list[str] = Field(min_length=1, max_length=500)
    minutes_per_lesson: int = Field(default=30, ge=1, le=1440)
    start_date: date | None = None
    lesson_minutes: dict[str, Annotated[StrictInt, Field(ge=1, le=1440)]] = Field(
        default_factory=dict
    )
    repeat_difficult: bool = False

    @model_validator(mode="after")
    def selected_durations(self):
        if self.lesson_minutes.keys() - set(self.lesson_ids):
            raise ValueError("Set durations only for selected lessons")
        return self

    @field_validator("title")
    @classmethod
    def nonblank_title(cls, value):
        if not value.strip():
            raise ValueError("Give the revision plan a title")
        return value

    @field_validator("study_days")
    @classmethod
    def valid_days(cls, value):
        if any(day < 0 or day > 6 for day in value) or len(set(value)) != len(value):
            raise ValueError("Choose distinct study days from Monday to Sunday")
        return sorted(value)

    @field_validator("lesson_ids")
    @classmethod
    def distinct_lessons(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Choose each lesson once")
        return value


class PlanItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    due_date: date | None = None
    completed: bool | None = None

    @field_validator("due_date", "completed")
    @classmethod
    def nonnull_changes(cls, value):
        if value is None:
            raise ValueError("Plan item changes cannot be null")
        return value


class RescheduleMove(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str
    due_date: date


class RescheduleApply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fingerprint: str = Field(min_length=64, max_length=64)
    moves: list[RescheduleMove] = Field(max_length=1000)


def item_dict(task, minutes):
    return {
        "task_id": task.task_id,
        "title": task.title,
        "lesson_id": task.lesson_id,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "completed": task.completed,
        "minutes": minutes,
    }


async def plan_tasks(session, user_id, plan_id):
    return (
        await session.scalars(
            select(Task)
            .join(RevisionPlanItem, RevisionPlanItem.task_id == Task.task_id)
            .where(Task.user_id == user_id, RevisionPlanItem.plan_id == plan_id)
            .order_by(Task.due_date, Task.created_at, Task.task_id)
        )
    ).all()


async def plan_dict(session, plan):
    minutes = dict(
        (
            await session.execute(
                select(RevisionPlanItem.task_id, RevisionPlanItem.minutes).where(
                    RevisionPlanItem.plan_id == plan.plan_id
                )
            )
        ).all()
    )
    return {
        "plan_id": plan.plan_id,
        "title": plan.title,
        "subject_id": plan.subject_id,
        "exam_date": plan.exam_date.isoformat(),
        "daily_minutes": plan.daily_minutes,
        "study_days": plan.study_days,
        "minutes_per_lesson": plan.minutes_per_lesson,
        "items": [
            item_dict(task, minutes[task.task_id])
            for task in await plan_tasks(session, plan.user_id, plan.plan_id)
        ],
    }


async def owned_plan(session, user_id, plan_id):
    plan = await session.scalar(
        select(RevisionPlan)
        .where(RevisionPlan.user_id == user_id, RevisionPlan.plan_id == plan_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if plan is None:
        raise HTTPException(404, "Revision plan not found")
    return plan


def today_for(user):
    return base.utc_now().astimezone(user_timezone(user)).date()


async def validate_plan_task_date(session, user, plan, task, due_date):
    if due_date is None or due_date < today_for(user) or due_date >= plan.exam_date:
        raise HTTPException(
            422, "Choose a revision date from today up to the day before the exam"
        )
    if due_date.weekday() not in plan.study_days:
        raise HTTPException(422, "Choose one of this plan's study days")
    link = await session.get(RevisionPlanItem, task.task_id)
    usage, _ = await schedule_state(
        session,
        user,
        due_date,
        due_date + timedelta(days=1),
        exclude_ids={task.task_id},
    )
    if usage[due_date] + link.minutes > plan.daily_minutes:
        raise HTTPException(
            422, "That day is full. Choose another study day within the daily capacity"
        )


async def validate_generated_task_edit(session, user, task, data):
    """Keep the same capacity rules when an existing Tasks screen edits a plan task."""
    link = await session.get(RevisionPlanItem, task.task_id)
    if link and "due_date" in data and data["due_date"] != task.due_date:
        plan = await owned_plan(session, user.user_id, link.plan_id)
        await validate_plan_task_date(session, user, plan, task, data["due_date"])


@router.get("")
async def list_plans(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    plans = (
        await session.scalars(
            select(RevisionPlan)
            .where(RevisionPlan.user_id == user.user_id)
            .order_by(RevisionPlan.exam_date, RevisionPlan.created_at)
        )
    ).all()
    return [await plan_dict(session, plan) for plan in plans]


@router.post("")
async def create_plan(
    body: PlanCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    await owned_subject(session, user.user_id, body.subject_id)
    lessons = [
        await owned_lesson(session, user.user_id, lesson_id)
        for lesson_id in body.lesson_ids
    ]
    if any(lesson.subject_id != body.subject_id for lesson in lessons):
        raise HTTPException(422, "Choose lessons belonging to the selected subject")
    today = today_for(user)
    validate_horizon(today, body.exam_date)
    start = body.start_date or today
    if start < today or body.exam_date <= start:
        raise HTTPException(
            422, "Choose a start date from today and an exam after the start date"
        )
    usage, _ = await schedule_state(session, user, start, body.exam_date)
    weak = (
        set(
            (
                await session.scalars(
                    select(StudyQuestion.lesson_id).where(
                        StudyQuestion.user_id == user.user_id,
                        StudyQuestion.lesson_id.in_(body.lesson_ids),
                        StudyQuestion.confidence.in_(["again", "hard"]),
                    )
                )
            ).all()
        )
        if body.repeat_difficult
        else set()
    )
    sessions = [(lesson, False) for lesson in lessons] + [
        (lesson, True) for lesson in lessons if lesson.lesson_id in weak
    ]
    demands = [
        (
            lesson.lesson_id + (":repeat" if repeat else ""),
            body.lesson_minutes.get(lesson.lesson_id, body.minutes_per_lesson),
            lesson.lesson_id if repeat else None,
        )
        for lesson, repeat in sessions
    ]
    dates = allocate_schedule(
        usage, start, body.exam_date, body.study_days, body.daily_minutes, demands
    )
    if dates is None:
        raise HTTPException(
            422,
            "No schedule was found before the exam. Increase daily minutes, add study days, or select fewer lessons",
        )
    schedule = [
        (lesson, dates[key], minutes, repeat)
        for (lesson, repeat), (key, minutes, _) in zip(sessions, demands)
    ]
    plan = RevisionPlan(
        user_id=user.user_id,
        **body.model_dump(exclude={"lesson_ids", "start_date", "lesson_minutes"}),
    )
    session.add(plan)
    await session.flush()
    for lesson, due_date, minutes, repeat in schedule:
        task = Task(
            user_id=user.user_id,
            subject_id=lesson.subject_id,
            unit_id=lesson.unit_id,
            lesson_id=lesson.lesson_id,
            title=f"{'Repeat' if repeat else 'Revise'} {lesson.title}",
            due_date=due_date,
            notes=f"{minutes} minutes · {body.title}",
        )
        session.add(task)
        await session.flush()
        session.add(
            RevisionPlanItem(
                plan_id=plan.plan_id, task_id=task.task_id, minutes=minutes
            )
        )
    await session.commit()
    return await plan_dict(session, plan)


@router.patch("/{plan_id}/items/{task_id}")
async def patch_plan_item(
    plan_id: str,
    task_id: str,
    body: PlanItemPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    plan = await owned_plan(session, user.user_id, plan_id)
    task = await session.scalar(
        select(Task)
        .join(RevisionPlanItem, RevisionPlanItem.task_id == Task.task_id)
        .where(
            Task.user_id == user.user_id,
            Task.task_id == task_id,
            RevisionPlanItem.plan_id == plan_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if task is None:
        raise HTTPException(404, "Revision plan item not found")
    data = body.model_dump(exclude_unset=True)
    if "due_date" in data and data["due_date"] != task.due_date:
        await validate_plan_task_date(session, user, plan, task, data["due_date"])
    if "completed" in data:
        data["completed_at"] = base.utc_now() if data["completed"] else None
    for field, value in data.items():
        setattr(task, field, value)
    await session.commit()
    await session.refresh(task)
    link = await session.get(RevisionPlanItem, task.task_id)
    return item_dict(task, link.minutes)


async def reschedule_context(session, user, plan):
    today = today_for(user)
    tasks = await plan_tasks(session, user.user_id, plan.plan_id)
    overdue = [
        task
        for task in tasks
        if not task.completed and task.due_date and task.due_date < today
    ]
    links = dict(
        (
            await session.execute(
                select(RevisionPlanItem.task_id, RevisionPlanItem.minutes).where(
                    RevisionPlanItem.plan_id == plan.plan_id
                )
            )
        ).all()
    )
    usage, state = await schedule_state(
        session,
        user,
        today,
        max(today, plan.exam_date),
        exclude_ids={task.task_id for task in overdue},
    )
    return today, overdue, links, usage, fingerprint_for(plan, user, today, state)


@router.post("/{plan_id}/reschedule/preview")
async def preview_reschedule(
    plan_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    plan = await owned_plan(session, user.user_id, plan_id)
    today, overdue, links, usage, fingerprint = await reschedule_context(
        session, user, plan
    )
    dates = allocate_schedule(
        usage,
        today,
        plan.exam_date,
        plan.study_days,
        plan.daily_minutes,
        [(task.task_id, links[task.task_id], None) for task in overdue],
    )
    if dates is None:
        raise HTTPException(
            422,
            "No schedule was found for missed revision before the exam with the current study days and capacity",
        )
    moves = []
    for task in overdue:
        minutes = links[task.task_id]
        day = dates[task.task_id]
        moves.append(
            {
                "task_id": task.task_id,
                "title": task.title,
                "from_date": task.due_date.isoformat(),
                "to_date": day.isoformat(),
                "minutes": minutes,
            }
        )
    return {"fingerprint": fingerprint, "moves": moves}


@router.post("/{plan_id}/reschedule")
async def apply_reschedule(
    plan_id: str,
    body: RescheduleApply,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    plan = await owned_plan(session, user.user_id, plan_id)
    today, overdue, links, usage, fingerprint = await reschedule_context(
        session, user, plan
    )
    if fingerprint != body.fingerprint:
        raise HTTPException(
            409,
            "The schedule changed. Preview missed revision again before applying it.",
        )
    proposed = {move.task_id: move.due_date for move in body.moves}
    if len(proposed) != len(body.moves) or set(proposed) != {
        task.task_id for task in overdue
    }:
        raise HTTPException(
            422, "Reschedule exactly the incomplete overdue items from the preview"
        )
    for task in overdue:
        day = proposed[task.task_id]
        if day < today or day >= plan.exam_date or day.weekday() not in plan.study_days:
            raise HTTPException(
                422, "Choose a study day from today up to the day before the exam"
            )
        usage[day] += links[task.task_id]
        if usage[day] > plan.daily_minutes:
            raise HTTPException(422, "That day exceeds the shared daily study capacity")
    # Mutate only after every proposed date has passed, so validation cannot
    # partially change tasks and completed/future work remains untouched.
    for task in overdue:
        task.due_date = proposed[task.task_id]
    await session.commit()
    return await plan_dict(session, plan)


@router.delete("/{plan_id}")
async def delete_plan(
    plan_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    await lock_student(session, user.user_id)
    plan = await owned_plan(session, user.user_id, plan_id)
    tasks = await plan_tasks(session, user.user_id, plan_id)
    await session.execute(
        delete(RevisionPlanItem).where(RevisionPlanItem.plan_id == plan_id)
    )
    if tasks:
        await session.execute(
            delete(Task).where(
                Task.user_id == user.user_id,
                Task.task_id.in_([task.task_id for task in tasks]),
            )
        )
    await session.delete(plan)
    await session.commit()
    return {"ok": True}
