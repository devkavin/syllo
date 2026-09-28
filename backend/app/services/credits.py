from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings
from backend.app.models import Plan, User

BONUS_QUESTS = (
    {"id": "onboarded", "label": "Finish setting up", "credits": 10},
    {"id": "first_session", "label": "Log your first focus session", "credits": 10},
    {"id": "first_lesson", "label": "Mark your first lesson done", "credits": 10},
)


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


class CreditService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    async def _locked_user(self, user_id: str) -> User:
        user = await self.session.scalar(
            select(User).where(User.user_id == user_id).with_for_update()
        )
        if user is None:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    async def _apply_refill(self, user: User) -> None:
        period = current_period()
        if user.credit_period == period:
            return
        plan = await self.session.get(Plan, user.plan_id)
        user.ai_credits_remaining = plan.credits if plan else 0
        user.credit_period = period
        if user.plan_id == "freshman":
            user.credit_bonuses = {}

    async def refill_if_needed(self, user_id: str) -> User:
        user = await self._locked_user(user_id)
        await self._apply_refill(user)
        await self.session.commit()
        return user

    async def consume(self, user_id: str, amount: int = 1) -> int:
        if amount < 1:
            raise ValueError("Credit amount must be positive")
        user = await self._locked_user(user_id)
        await self._apply_refill(user)
        if user.ai_credits_remaining < amount:
            await self.session.rollback()
            raise HTTPException(
                status_code=402,
                detail="You've used all your study companion helps for this month.",
            )
        user.ai_credits_remaining -= amount
        remaining = user.ai_credits_remaining
        await self.session.commit()
        return remaining

    async def refund(self, user_id: str, amount: int = 1) -> int:
        user = await self._locked_user(user_id)
        plan = await self.session.get(Plan, user.plan_id)
        cap = (
            self.settings.free_plan_max_credits
            if user.plan_id == "freshman"
            else (plan.credits if plan else user.ai_credits_remaining + amount)
        )
        user.ai_credits_remaining = min(cap, user.ai_credits_remaining + amount)
        remaining = user.ai_credits_remaining
        await self.session.commit()
        return remaining
