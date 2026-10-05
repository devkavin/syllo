from datetime import datetime, timedelta, timezone
from secrets import token_urlsafe

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import Circle, CircleMember, CircleGoal, StudySession, User, Lesson, Task, CircleStudyEvent, CircleParticipation
from backend.app.services.circle_scheduling import locked_circle
from backend.app.services.scheduling import lock_schedule_users

router = APIRouter(prefix="/circles", tags=["circles"])


class Title(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=160)

    @field_validator("title")
    @classmethod
    def clean(cls, value):
        if not value.strip():
            raise ValueError("Please enter a title")
        return value.strip()


class Privacy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    share_weekly_time: bool | None = None
    share_availability: bool | None = None


class GoalTitle(Title):
    lesson_id: str | None = None
    task_id: str | None = None


class CircleTitle(Title):
    title: str = Field(min_length=1, max_length=80)


class Completion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    completed: bool


async def membership(session, circle_id, user_id):
    member = await session.get(CircleMember, (circle_id, user_id))
    if member is None:
        raise HTTPException(404, "Circle not found")
    return member


@router.get("")
async def list_circles(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    rows = (await session.scalars(select(Circle).join(CircleMember).where(CircleMember.user_id == user.user_id).order_by(Circle.created_at))).all()
    return [{"id": c.circle_id, "name": c.name, "owner_id": c.owner_id} for c in rows]


@router.post("", status_code=201)
async def create(body: CircleTitle, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await session.scalar(select(User).where(User.user_id == user.user_id).with_for_update())
    count = await session.scalar(select(func.count()).select_from(Circle).where(Circle.owner_id == user.user_id))
    if count >= 5:
        raise HTTPException(400, "You can create up to five circles")
    memberships = await session.scalar(select(func.count()).select_from(CircleMember).where(CircleMember.user_id == user.user_id))
    if memberships >= 10:
        raise HTTPException(400, "You can belong to up to ten circles")
    circle = Circle(owner_id=user.user_id, name=body.title, invite_token=token_urlsafe(32))
    session.add(circle)
    await session.flush()
    session.add(CircleMember(circle_id=circle.circle_id, user_id=user.user_id))
    await session.commit()
    return {"id": circle.circle_id, "name": circle.name}


@router.get("/invite/{token}")
async def preview(token: str, session: AsyncSession = Depends(get_session)):
    circle = await session.scalar(select(Circle).where(Circle.invite_token == token)) if 30 <= len(token) <= 64 else None
    if circle is None:
        raise HTTPException(404, "This invite is no longer available")
    owner = await session.get(User, circle.owner_id)
    # Public invitations reveal neither members, goals, email nor study activity.
    return {"name": circle.name, "referral_code": owner.referral_code}


@router.post("/invite/{token}/join")
async def join(token: str, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await session.scalar(select(User).where(User.user_id == user.user_id).with_for_update())
    circle = await session.scalar(select(Circle).where(Circle.invite_token == token).with_for_update())
    if circle is None:
        raise HTTPException(404, "This invite is no longer available")
    member = await session.get(CircleMember, (circle.circle_id, user.user_id))
    if member is None:
        count = await session.scalar(select(func.count()).select_from(CircleMember).where(CircleMember.circle_id == circle.circle_id))
        own_count = await session.scalar(select(func.count()).select_from(CircleMember).where(CircleMember.user_id == user.user_id))
        if count >= 30 or own_count >= 10:
            raise HTTPException(400, "This circle or your membership limit is full")
        session.add(CircleMember(circle_id=circle.circle_id, user_id=user.user_id))
        await session.commit()
    # Joining never awards helps: only the existing unique-signup referral ledger does.
    return {"id": circle.circle_id}


@router.get("/{circle_id}")
async def detail(circle_id: str, request: Request, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    own = await membership(session, circle_id, user.user_id)
    circle = await session.get(Circle, circle_id)
    rows = (await session.execute(select(CircleMember, User.name).join(User).where(CircleMember.circle_id == circle_id))).all()
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=now.weekday())
    shared = [member.user_id for member, _ in rows if member.share_weekly_time]
    times = dict((await session.execute(select(StudySession.user_id, func.sum(StudySession.duration_seconds)).where(StudySession.user_id.in_(shared), StudySession.finished_at.is_not(None), StudySession.started_at >= start, StudySession.started_at <= now).group_by(StudySession.user_id))).all()) if shared else {}
    goals = (await session.scalars(select(CircleGoal).where(CircleGoal.circle_id == circle_id).order_by(CircleGoal.created_at.desc()).limit(300))).all()
    base = str(request.app.state.settings.app_url).rstrip("/")
    return {"id": circle_id, "name": circle.name, "owner_id": circle.owner_id,
            "invite_url": f"{base}/join/{circle.invite_token}?ref={user.referral_code}",
            "share_weekly_time": own.share_weekly_time,
            "share_availability": own.share_availability,
            "members": [{"id": m.user_id, "name": name, "weekly_minutes": int(times.get(m.user_id, 0) / 60) if m.share_weekly_time else None} for m, name in rows],
            "goals": [{"id": g.goal_id, "user_id": g.user_id, "title": g.title, "completed": g.completed, **({"lesson_id": g.lesson_id, "task_id": g.task_id} if g.user_id == user.user_id else {})} for g in goals]}


@router.patch("/{circle_id}/privacy")
async def privacy(circle_id: str, body: Privacy, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    _, members = await locked_circle(session, user, circle_id)
    member = members[user.user_id]
    for key, value in body.model_dump(exclude_none=True).items(): setattr(member, key, value)
    await session.commit()
    return {"share_weekly_time": member.share_weekly_time, "share_availability": member.share_availability}


@router.post("/{circle_id}/goals", status_code=201)
async def add_goal(circle_id: str, body: GoalTitle, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    # Same circle -> membership lock order as removal. Validate the locking read,
    # not a membership snapshot obtained before another transaction removed it.
    await lock_schedule_users(session, [user.user_id])
    await session.scalar(select(Circle).where(Circle.circle_id == circle_id).with_for_update())
    member = await session.scalar(select(CircleMember).where(CircleMember.circle_id == circle_id, CircleMember.user_id == user.user_id).with_for_update())
    if member is None:
        raise HTTPException(404, "Circle not found")
    count = await session.scalar(select(func.count()).select_from(CircleGoal).where(CircleGoal.circle_id == circle_id, CircleGoal.user_id == user.user_id))
    if count >= 10:
        raise HTTPException(400, "Keep up to ten goals in each circle. Remove an old goal to add another.")
    for key, model, field in ((body.lesson_id, Lesson, Lesson.lesson_id), (body.task_id, Task, Task.task_id)):
        if key and not await session.scalar(select(model).where(field == key, model.user_id == user.user_id)): raise HTTPException(404, "Linked study item not found")
    goal = CircleGoal(circle_id=member.circle_id, user_id=user.user_id, **body.model_dump())
    session.add(goal)
    await session.commit()
    return {"id": goal.goal_id}


@router.patch("/{circle_id}/goals/{goal_id}")
async def complete(circle_id: str, goal_id: str, body: Completion, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await membership(session, circle_id, user.user_id)
    goal = await session.get(CircleGoal, goal_id)
    if goal is None or goal.circle_id != circle_id or goal.user_id != user.user_id:
        raise HTTPException(404, "Goal not found")
    goal.completed = body.completed
    await session.commit()
    return {"completed": goal.completed}


@router.delete("/{circle_id}/goals/{goal_id}", status_code=204)
async def remove_goal(circle_id: str, goal_id: str, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await membership(session, circle_id, user.user_id)
    await session.execute(delete(CircleGoal).where(CircleGoal.goal_id == goal_id, CircleGoal.circle_id == circle_id, CircleGoal.user_id == user.user_id))
    await session.commit()


@router.post("/{circle_id}/rotate-invite")
async def rotate(circle_id: str, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    await membership(session, circle_id, user.user_id)
    circle = await session.get(Circle, circle_id)
    if circle.owner_id != user.user_id:
        raise HTTPException(403, "Only the circle owner can replace its invite")
    circle.invite_token = token_urlsafe(32)
    await session.commit()
    return {"ok": True}


@router.delete("/{circle_id}/members/{member_id}", status_code=204)
async def remove_member(circle_id: str, member_id: str, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    circle, _ = await locked_circle(session, user, circle_id, [member_id])
    if member_id == circle.owner_id or (member_id != user.user_id and user.user_id != circle.owner_id):
        raise HTTPException(403, "Only owners can remove other members. Owners must delete their circle to leave.")
    await session.scalar(select(CircleMember).where(CircleMember.circle_id == circle_id, CircleMember.user_id == member_id).with_for_update())
    future = (await session.scalars(select(CircleStudyEvent).where(CircleStudyEvent.circle_id == circle_id, CircleStudyEvent.ends_at > datetime.now(timezone.utc)).with_for_update())).all()
    for event in future:
        if event.organizer_id == member_id: event.canceled = True
    await session.execute(delete(CircleParticipation).where(CircleParticipation.user_id == member_id, CircleParticipation.event_id.in_([e.id for e in future])))
    await session.execute(delete(CircleGoal).where(CircleGoal.circle_id == circle_id, CircleGoal.user_id == member_id))
    await session.execute(delete(CircleMember).where(CircleMember.circle_id == circle_id, CircleMember.user_id == member_id))
    await session.commit()


@router.delete("/{circle_id}", status_code=204)
async def remove_circle(circle_id: str, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    ids = (await session.scalars(select(CircleMember.user_id).where(CircleMember.circle_id == circle_id))).all()
    circle, _ = await locked_circle(session, user, circle_id, ids)
    if circle.owner_id != user.user_id:
        raise HTTPException(403, "Only the owner can delete this circle")
    await session.execute(delete(CircleGoal).where(CircleGoal.circle_id == circle_id))
    await session.execute(delete(CircleMember).where(CircleMember.circle_id == circle_id))
    event_ids = (await session.scalars(select(CircleStudyEvent.id).where(CircleStudyEvent.circle_id == circle_id))).all()
    from sqlalchemy import update
    await session.execute(update(StudySession).where(StudySession.circle_event_id.in_(event_ids)).values(circle_event_id=None))
    await session.execute(delete(CircleParticipation).where(CircleParticipation.event_id.in_(event_ids)))
    await session.execute(delete(CircleStudyEvent).where(CircleStudyEvent.circle_id == circle_id))
    await session.delete(circle)
    await session.commit()
