from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import CircleStudyEvent, CircleParticipation, CircleMember
from backend.app.schemas.scheduling import SlotRequest, EventCreate, EventResponse, EventReschedule
from backend.app.services.circle_scheduling import locked_circle, locked_event, validate_participants, validate_event_time, check_busy, suggest_slots, event_view
from backend.app.services.scheduling import utc

router = APIRouter(tags=["circle scheduling"])


@router.post("/circles/{circle_id}/availability")
async def suggestions(circle_id: str, body: SlotRequest, user=Depends(get_current_user), session=Depends(get_session)):
    return await suggest_slots(session, user, circle_id, body)


@router.get("/circles/{circle_id}/sessions")
async def list_events(circle_id: str, user=Depends(get_current_user), session=Depends(get_session)):
    await locked_circle(session, user, circle_id)
    events = (await session.scalars(select(CircleStudyEvent).where(CircleStudyEvent.circle_id == circle_id, CircleStudyEvent.ends_at >= datetime.now(timezone.utc), CircleStudyEvent.canceled.is_(False)).order_by(CircleStudyEvent.starts_at).limit(100))).all()
    return [await event_view(session, e, user.user_id) for e in events]


@router.get("/circle-sessions/{event_id}")
async def personal_event(event_id: str, user=Depends(get_current_user), session=Depends(get_session)):
    event = await session.get(CircleStudyEvent, event_id)
    if not event: raise HTTPException(404, "Session not found")
    await locked_circle(session, user, event.circle_id)
    await session.refresh(event)
    return await event_view(session, event, user.user_id)


@router.post("/circles/{circle_id}/sessions", status_code=201)
async def propose(circle_id: str, body: EventCreate, user=Depends(get_current_user), session=Depends(get_session)):
    _, members = await locked_circle(session, user, circle_id, body.participants)
    validate_participants(user, body.participants, members)
    start, end = utc(body.start), utc(body.end)
    validate_event_time(start, end)
    await check_busy(session, user, start, end)
    # Bound proposals without expiring or deleting anyone's history.
    active = (await session.scalars(select(CircleStudyEvent.id).where(CircleStudyEvent.circle_id == circle_id, CircleStudyEvent.ends_at > datetime.now(timezone.utc), CircleStudyEvent.canceled.is_(False)).with_for_update())).all()
    if len(active) >= 100: raise HTTPException(400, "Keep at most 100 upcoming Circle sessions")
    event = CircleStudyEvent(circle_id=circle_id, organizer_id=user.user_id, topic=body.topic, starts_at=start, ends_at=end)
    session.add(event); await session.flush()
    session.add_all([CircleParticipation(event_id=event.id, user_id=uid, status="accepted" if uid == user.user_id else "invited", accepted_revision=1 if uid == user.user_id else None) for uid in body.participants])
    await session.commit()
    return await event_view(session, event, user.user_id)


@router.post("/circles/{circle_id}/sessions/{event_id}/respond")
async def respond(circle_id: str, event_id: str, body: EventResponse, user=Depends(get_current_user), session=Depends(get_session)):
    event, _ = await locked_event(session, user, circle_id, event_id)
    part = await session.scalar(select(CircleParticipation).where(CircleParticipation.event_id == event_id, CircleParticipation.user_id == user.user_id).with_for_update().execution_options(populate_existing=True))
    if not part: raise HTTPException(404, "Session not found")
    if event.canceled or body.revision != event.revision: raise HTTPException(409, "This session changed. Refresh and review the new time.")
    if utc(event.ends_at) <= datetime.now(timezone.utc): raise HTTPException(409, "This session has ended")
    if body.status == "accepted": await check_busy(session, user, utc(event.starts_at), utc(event.ends_at), event.id)
    part.status = body.status; part.accepted_revision = event.revision if body.status == "accepted" else None
    await session.commit()
    return await event_view(session, event, user.user_id)


@router.patch("/circles/{circle_id}/sessions/{event_id}")
async def reschedule(circle_id: str, event_id: str, body: EventReschedule, user=Depends(get_current_user), session=Depends(get_session)):
    event, members = await locked_event(session, user, circle_id, event_id)
    if event.organizer_id != user.user_id: raise HTTPException(403, "Only the organizer can reschedule")
    if event.canceled or body.revision != event.revision: raise HTTPException(409, "This session changed. Refresh first.")
    start, end = utc(body.start), utc(body.end)
    validate_event_time(start, end); await check_busy(session, user, start, end, event.id)
    event.starts_at = start; event.ends_at = end; event.revision += 1
    parts = (await session.scalars(select(CircleParticipation).where(CircleParticipation.event_id == event.id).with_for_update())).all()
    for part in parts:
        if part.user_id not in members: await session.delete(part); continue
        part.status = "accepted" if part.user_id == user.user_id else "invited"
        part.accepted_revision = event.revision if part.user_id == user.user_id else None
    await session.commit()
    return await event_view(session, event, user.user_id)


@router.delete("/circles/{circle_id}/sessions/{event_id}", status_code=204)
async def cancel(circle_id: str, event_id: str, user=Depends(get_current_user), session=Depends(get_session)):
    event, _ = await locked_event(session, user, circle_id, event_id)
    if event.organizer_id != user.user_id: raise HTTPException(403, "Only the organizer can cancel")
    event.canceled = True
    await session.commit()
