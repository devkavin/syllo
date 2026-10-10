from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.academics import owned_lesson, owned_subject
from backend.app.database import get_session
from backend.app.models import RevisionPlan, RevisionPlanItem, Task, User, base
from backend.app.services.scheduling import user_timezone
from backend.app.services.study import lock_student

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


def item_dict(task):
    return {
        "task_id": task.task_id,
        "title": task.title,
        "lesson_id": task.lesson_id,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "completed": task.completed,
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
    return {
        "plan_id": plan.plan_id,
        "title": plan.title,
        "subject_id": plan.subject_id,
        "exam_date": plan.exam_date.isoformat(),
        "daily_minutes": plan.daily_minutes,
        "study_days": plan.study_days,
        "items": [
            item_dict(task)
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
    tasks = await plan_tasks(session, user.user_id, plan.plan_id)
    scheduled = sum(
        item.task_id != task.task_id and item.due_date == due_date for item in tasks
    )
    if (scheduled + 1) * plan.minutes_per_lesson > plan.daily_minutes:
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
    start = body.start_date or today
    if start < today or body.exam_date <= start:
        raise HTTPException(
            422, "Choose a start date from today and an exam after the start date"
        )
    capacity = body.daily_minutes // body.minutes_per_lesson
    if capacity < 1:
        raise HTTPException(422, "Daily capacity must allow at least one lesson")
    schedule = []
    day = start
    while day < body.exam_date and len(schedule) < len(lessons):
        if day.weekday() in body.study_days:
            schedule.extend([day] * min(capacity, len(lessons) - len(schedule)))
        day += timedelta(days=1)
    if len(schedule) < len(lessons):
        raise HTTPException(
            422,
            "These lessons cannot fit before the exam. Increase daily minutes, add study days, or select fewer lessons",
        )
    plan = RevisionPlan(
        user_id=user.user_id, **body.model_dump(exclude={"lesson_ids", "start_date"})
    )
    session.add(plan)
    await session.flush()
    for lesson, due_date in zip(lessons, schedule):
        task = Task(
            user_id=user.user_id,
            subject_id=lesson.subject_id,
            unit_id=lesson.unit_id,
            lesson_id=lesson.lesson_id,
            title=f"Revise {lesson.title}",
            due_date=due_date,
            notes=f"{body.minutes_per_lesson} minutes · {body.title}",
        )
        session.add(task)
        await session.flush()
        session.add(RevisionPlanItem(plan_id=plan.plan_id, task_id=task.task_id))
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
    return item_dict(task)


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
