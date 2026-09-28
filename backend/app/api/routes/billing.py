from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import PaymentTransaction, Plan, User
from backend.app.services.credits import BONUS_QUESTS, CreditService
from backend.app.services.stripe_billing import StripeBillingService

router = APIRouter(prefix="/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_id: str = Field(min_length=1, max_length=64)


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


def service(request: Request) -> StripeBillingService:
    configured = request.app.state.stripe_service
    if configured is None:
        try:
            configured = StripeBillingService(request.app.state.settings)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=503, detail="Billing is not configured"
            ) from exc
        request.app.state.stripe_service = configured
    return configured


def plan_dict(plan: Plan) -> dict:
    return {
        "id": plan.plan_id,
        "name": plan.name,
        "price_cents": plan.price_cents,
        "credits": plan.credits,
        "features": plan.features,
        "active": plan.active,
    }


@router.get("/plans")
async def plans(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    rows = (
        await session.scalars(
            select(Plan).where(Plan.active.is_(True)).order_by(Plan.price_cents)
        )
    ).all()
    return {"plans": [plan_dict(plan) for plan in rows]}


@router.get("/usage")
async def usage(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    user = await CreditService(session, request.app.state.settings).refill_if_needed(
        user.user_id
    )
    plan = await session.get(Plan, user.plan_id)
    return {
        "plan": plan_dict(plan),
        "credits_remaining": user.ai_credits_remaining,
        "credit_period": user.credit_period,
        "bonuses_claimed": user.credit_bonuses,
        "quests": BONUS_QUESTS,
        "free_start": request.app.state.settings.free_plan_start_credits,
        "free_max": request.app.state.settings.free_plan_max_credits,
    }


@router.post("/checkout")
async def checkout(
    body: CheckoutRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    plan = await session.get(Plan, body.plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    if not plan.active or plan.price_cents <= 0:
        raise HTTPException(
            status_code=400, detail="Plan is not available for checkout"
        )
    stripe_session = await service(request).create_checkout(user, plan)
    checkout_id = stripe_session.get("id")
    checkout_url = stripe_session.get("url")
    if not checkout_id or not checkout_url:
        raise HTTPException(
            status_code=502, detail="Stripe checkout could not be created"
        )
    session.add(
        PaymentTransaction(
            user_id=user.user_id,
            plan_id=plan.plan_id,
            stripe_checkout_session_id=checkout_id,
            stripe_customer_id=stripe_session.get("customer"),
            stripe_subscription_id=stripe_session.get("subscription"),
            amount_cents=plan.price_cents,
        )
    )
    await session.commit()
    return {"url": checkout_url, "session_id": checkout_id}


@router.get("/status/{checkout_session_id}")
async def status(
    checkout_session_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    transaction = await session.scalar(
        select(PaymentTransaction).where(
            PaymentTransaction.stripe_checkout_session_id == checkout_session_id,
            PaymentTransaction.user_id == user.user_id,
        )
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Payment not found")
    return {
        "session_id": transaction.stripe_checkout_session_id,
        "status": transaction.status,
        "payment_status": transaction.payment_status,
    }


@router.post("/portal")
async def portal(
    _: EmptyRequest,
    request: Request,
    user: User = Depends(get_current_user),
) -> dict:
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account exists")
    result = await service(request).create_portal(user)
    if not result.get("url"):
        raise HTTPException(
            status_code=502, detail="Stripe portal could not be created"
        )
    return {"url": result["url"]}
