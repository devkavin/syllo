from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import require_admin
from backend.app.api.routes.auth import serialize_user
from backend.app.database import get_session
from backend.app.models import AIUsageLog, PaymentTransaction, Plan, User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/companion-usage")
async def companion_usage(days: int = Query(default=30, ge=1, le=90),
    _: User = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await session.execute(select(
        AIUsageLog.plan_id, AIUsageLog.model, AIUsageLog.feature, AIUsageLog.ok,
        func.count(), func.sum(AIUsageLog.input_tokens), func.sum(AIUsageLog.output_tokens),
        func.sum(AIUsageLog.thinking_tokens), func.sum(AIUsageLog.cached_input_tokens),
        func.sum(AIUsageLog.total_tokens), func.sum(AIUsageLog.estimated_cost_microusd),
        func.avg(AIUsageLog.latency_ms),
    ).where(AIUsageLog.created_at >= since).group_by(
        AIUsageLog.plan_id, AIUsageLog.model, AIUsageLog.feature, AIUsageLog.ok))).all()
    return {"days": days, "cost_basis": "conservative estimate; includes unresolved reservations",
        "groups": [{"plan": plan, "model": model, "feature": feature, "successful": ok,
                    "requests": count, "input_tokens": inputs, "output_tokens": outputs,
                    "thinking_tokens": thinking, "cached_input_tokens": cached, "total_tokens": total,
                    "estimated_cost_microusd": cost, "mean_latency_ms": round(latency or 0)}
                   for plan, model, feature, ok, count, inputs, outputs, thinking, cached, total, cost, latency in rows]}


class AdminUserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: str | None = None
    ai_credits_remaining: int | None = Field(default=None, ge=0)
    role: str | None = Field(default=None, pattern="^(user|admin)$")


class PlanPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    price_cents: int = Field(ge=0)
    credits: int = Field(ge=0)
    features: list[str] = Field(default_factory=list)
    active: bool = True


class AdminSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plans: list[PlanPatch] | None = None


def plan_dict(plan: Plan) -> dict:
    return {
        "id": plan.plan_id,
        "name": plan.name,
        "price_cents": plan.price_cents,
        "credits": plan.credits,
        "features": plan.features,
        "active": plan.active,
    }


def transaction_dict(transaction: PaymentTransaction) -> dict:
    return {
        "transaction_id": transaction.transaction_id,
        "session_id": transaction.stripe_checkout_session_id,
        "user_id": transaction.user_id,
        "plan_id": transaction.plan_id,
        "amount_cents": transaction.amount_cents,
        "currency": transaction.currency,
        "status": transaction.status,
        "payment_status": transaction.payment_status,
        "created_at": transaction.created_at.isoformat(),
        "updated_at": transaction.updated_at.isoformat(),
    }


@router.get("/overview")
async def overview(
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    total_users = await session.scalar(select(func.count()).select_from(User))
    plan_rows = (
        await session.execute(
            select(User.plan_id, func.count(User.user_id)).group_by(User.plan_id)
        )
    ).all()
    by_plan = {row.plan_id: int(row[1]) for row in plan_rows}
    revenue = await session.scalar(
        select(func.coalesce(func.sum(PaymentTransaction.amount_cents), 0)).where(
            PaymentTransaction.payment_status == "paid"
        )
    )
    ai_calls = await session.scalar(select(func.count()).select_from(AIUsageLog))
    ai_ok = await session.scalar(
        select(func.count()).select_from(AIUsageLog).where(AIUsageLog.ok.is_(True))
    )
    signups = await session.scalar(
        select(func.count())
        .select_from(User)
        .where(User.created_at >= datetime.now(timezone.utc) - timedelta(days=7))
    )
    return {
        "total_users": int(total_users or 0),
        "by_plan": by_plan,
        "revenue_cents": int(revenue or 0),
        "paid_users": int(total_users or 0) - by_plan.get("freshman", 0),
        "ai_calls": int(ai_calls or 0),
        "ai_ok_rate": round((ai_ok / ai_calls) * 100, 1) if ai_calls else 100.0,
        "signups_last_7_days": int(signups or 0),
    }


@router.get("/users")
async def users(
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = (
        await session.scalars(
            select(User).order_by(User.created_at.desc()).limit(limit)
        )
    ).all()
    return [serialize_user(user) for user in rows]


@router.patch("/users/{user_id}")
async def patch_user(
    user_id: str,
    body: AdminUserPatch,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    data = body.model_dump(exclude_none=True)
    if plan_id := data.pop("plan", None):
        if await session.get(Plan, plan_id) is None:
            raise HTTPException(status_code=400, detail="Unknown plan")
        user.plan_id = plan_id
    for field, value in data.items():
        setattr(user, field, value)
    await session.commit()
    await session.refresh(user)
    return serialize_user(user)


@router.get("/transactions")
async def transactions(
    limit: int = Query(default=100, ge=1, le=500),
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    rows = (
        await session.scalars(
            select(PaymentTransaction)
            .order_by(PaymentTransaction.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [transaction_dict(row) for row in rows]


@router.get("/settings")
async def get_settings(
    request: Request,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    plans = (await session.scalars(select(Plan).order_by(Plan.price_cents))).all()
    settings = request.app.state.settings
    return {
        "stripe_configured": settings.stripe_secret_key is not None,
        "gemini_configured": settings.gemini_api_key is not None,
        "google_configured": bool(
            settings.google_client_id and settings.google_client_secret
        ),
        "plans": [plan_dict(plan) for plan in plans],
    }


@router.patch("/settings")
async def patch_settings(
    body: AdminSettingsPatch,
    _: User = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    if body.plans is not None:
        for item in body.plans:
            plan = await session.get(Plan, item.id)
            if plan is None:
                plan = Plan(plan_id=item.id)
                session.add(plan)
            plan.name = item.name
            plan.price_cents = item.price_cents
            plan.credits = item.credits
            plan.features = [
                feature.strip() for feature in item.features if feature.strip()
            ]
            plan.active = item.active
        await session.commit()
    return {"ok": True}
