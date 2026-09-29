from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings
from backend.app.models import Plan, Referral, User

BONUS_QUESTS = (
    {"id": "onboarded", "label": "Finish setting up", "credits": 10},
    {"id": "first_subject", "label": "Add your first subject", "credits": 5},
    {"id": "first_session", "label": "Log your first focus session", "credits": 5},
    {"id": "first_lesson", "label": "Mark your first lesson done", "credits": 5},
    {"id": "first_review", "label": "Complete your first review", "credits": 5},
)


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def referral_month_bounds() -> tuple[datetime, datetime]:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    return start, (start + timedelta(days=32)).replace(day=1)


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
        recurring = plan.credits if plan else 0
        if user.plan_id == "freshman":
            user.bonus_credits_remaining = min(
                max(0, user.bonus_credits_remaining),
                max(0, self.settings.free_plan_max_credits - recurring),
            )
            user.ai_credits_remaining = recurring + user.bonus_credits_remaining
        else:
            user.bonus_credits_remaining = 0
            user.ai_credits_remaining = recurring
        user.credit_period = period

    async def refill_if_needed(self, user_id: str, *, commit: bool = True) -> User:
        user = await self._locked_user(user_id)
        await self._apply_refill(user)
        if commit:
            await self.session.commit()
        else:
            await self.session.flush()
        return user

    async def consume(
        self, user_id: str, amount: int = 1, *, commit: bool = True
    ) -> int:
        remaining, _ = await self.consume_with_source(user_id, amount, commit=commit)
        return remaining

    async def consume_with_source(
        self, user_id: str, amount: int = 1, *, commit: bool = True
    ) -> tuple[int, int]:
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
        recurring_remaining = max(0, user.ai_credits_remaining - user.bonus_credits_remaining)
        bonus_used = max(0, amount - recurring_remaining)
        user.ai_credits_remaining -= amount
        user.bonus_credits_remaining -= bonus_used
        remaining = user.ai_credits_remaining
        if commit:
            await self.session.commit()
        else:
            await self.session.flush()
        return remaining, bonus_used

    async def grant_bonus(
        self, user_id: str, amount: int, cap: int, *, commit: bool = True
    ) -> int:
        user = await self._locked_user(user_id)
        await self._apply_refill(user)
        awarded = max(0, min(amount, cap - user.ai_credits_remaining))
        user.ai_credits_remaining += awarded
        if user.plan_id == "freshman":
            user.bonus_credits_remaining += awarded
        if commit:
            await self.session.commit()
        else:
            await self.session.flush()
        return awarded

    async def award_signup_referral(
        self, referrer_id: str, referred_user_id: str, *, commit: bool = True
    ) -> int:
        # Lock the referrer across count, award, and referral insert so two
        # simultaneous signups cannot both claim the final monthly reward.
        referrer = await self._locked_user(referrer_id)
        start, end = referral_month_bounds()
        rewarded_this_month = await self.session.scalar(
            select(func.count())
            .select_from(Referral)
            .where(
                Referral.referrer_id == referrer_id,
                Referral.credits_awarded > 0,
                Referral.created_at >= start,
                Referral.created_at < end,
            )
        )
        awarded = 0
        if rewarded_this_month < self.settings.referral_monthly_limit:
            await self._apply_refill(referrer)
            plan = await self.session.get(Plan, referrer.plan_id)
            cap = (
                self.settings.free_plan_max_credits
                if referrer.plan_id == "freshman"
                else (plan.credits if plan else referrer.ai_credits_remaining)
            )
            awarded = max(
                0,
                min(self.settings.referral_bonus_credits, cap - referrer.ai_credits_remaining),
            )
            referrer.ai_credits_remaining += awarded
            if referrer.plan_id == "freshman":
                referrer.bonus_credits_remaining += awarded
        self.session.add(
            Referral(
                referrer_id=referrer_id,
                referred_user_id=referred_user_id,
                credits_awarded=awarded,
            )
        )
        if commit:
            await self.session.commit()
        else:
            await self.session.flush()
        return awarded

    async def refund(self, user_id: str, amount: int = 1, *, bonus_amount: int = 0) -> int:
        user = await self._locked_user(user_id)
        plan = await self.session.get(Plan, user.plan_id)
        cap = (
            self.settings.free_plan_max_credits
            if user.plan_id == "freshman"
            else (plan.credits if plan else user.ai_credits_remaining + amount)
        )
        restored = min(amount, max(0, cap - user.ai_credits_remaining))
        user.ai_credits_remaining += restored
        user.bonus_credits_remaining += min(restored, bonus_amount)
        remaining = user.ai_credits_remaining
        await self.session.commit()
        return remaining
