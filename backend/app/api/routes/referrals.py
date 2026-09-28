from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import Lesson, Plan, Referral, StudySession, User
from backend.app.services.credits import BONUS_QUESTS, CreditService

router = APIRouter(tags=["credits"])


@router.get("/me/referrals")
async def my_referrals(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not user.referral_code:
        user.referral_code = secrets.token_hex(4)
        await session.commit()
    count, credits = (
        await session.execute(
            select(
                func.count(Referral.referral_id),
                func.coalesce(func.sum(Referral.credits_awarded), 0),
            ).where(Referral.referrer_id == user.user_id)
        )
    ).one()
    return {
        "referral_code": user.referral_code,
        "count": int(count),
        "credits_earned": int(credits),
        "per_signup_credits": request.app.state.settings.referral_bonus_credits,
    }


@router.post("/bonuses/claim/{quest_id}")
async def claim_bonus(
    quest_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    quest = next((item for item in BONUS_QUESTS if item["id"] == quest_id), None)
    if quest is None:
        raise HTTPException(status_code=404, detail="Unknown quest")
    user = await CreditService(session, request.app.state.settings).refill_if_needed(
        user.user_id
    )
    bonuses = dict(user.credit_bonuses or {})
    if bonuses.get(quest_id):
        return {
            "already_claimed": True,
            "credits_remaining": user.ai_credits_remaining,
        }

    if quest_id == "onboarded":
        eligible = user.onboarded
    elif quest_id == "first_session":
        eligible = bool(
            await session.scalar(
                select(func.count())
                .select_from(StudySession)
                .where(StudySession.user_id == user.user_id)
            )
        )
    else:
        eligible = bool(
            await session.scalar(
                select(func.count())
                .select_from(Lesson)
                .where(
                    Lesson.user_id == user.user_id,
                    Lesson.status.in_(("done", "completed")),
                )
            )
        )
    if not eligible:
        raise HTTPException(status_code=400, detail="Quest not completed yet")

    plan = await session.get(Plan, user.plan_id)
    cap = (
        request.app.state.settings.free_plan_max_credits
        if user.plan_id == "freshman"
        else plan.credits
    )
    bonuses[quest_id] = True
    user.credit_bonuses = bonuses
    user.ai_credits_remaining = min(cap, user.ai_credits_remaining + quest["credits"])
    await session.commit()
    return {"ok": True, "credits_remaining": user.ai_credits_remaining}
