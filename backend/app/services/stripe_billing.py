from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import stripe
from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings
from backend.app.models import PaymentTransaction, Plan, User


def as_dict(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    return dict(value)


def event_time(event: dict) -> datetime:
    return datetime.fromtimestamp(int(event.get("created") or 0), timezone.utc)


def comparable(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


class StripeBillingService:
    def __init__(self, settings: Settings) -> None:
        if settings.stripe_secret_key is None:
            raise RuntimeError("Stripe is not configured")
        self.settings = settings
        self.client = stripe.StripeClient(settings.stripe_secret_key.get_secret_value())
        self._intro_coupon_valid: bool | None = None

    def price_for(self, plan: Plan) -> str:
        configured = {
            "scholar": self.settings.stripe_price_scholar,
            "deans_list": self.settings.stripe_price_deans_list,
        }.get(plan.plan_id)
        price_id = plan.stripe_price_id or configured
        if not price_id:
            raise HTTPException(status_code=503, detail="Plan price is not configured")
        return price_id

    async def deans_intro_offer_available(self) -> bool:
        coupon_id = self.settings.stripe_deans_intro_coupon
        if not coupon_id:
            return False
        if self._intro_coupon_valid is not None:
            return self._intro_coupon_valid
        try:
            coupon = as_dict(
                await asyncio.to_thread(self.client.v1.coupons.retrieve, coupon_id)
            )
        except Exception:
            self._intro_coupon_valid = False
            return False
        self._intro_coupon_valid = bool(
            coupon.get("valid", True)
            and coupon.get("amount_off") == 300
            and coupon.get("currency") == "usd"
            and coupon.get("duration") == "repeating"
            and coupon.get("duration_in_months") == self.settings.deans_intro_months
        )
        return self._intro_coupon_valid

    async def create_checkout(self, user: User, plan: Plan) -> dict:
        app_url = str(self.settings.app_url).rstrip("/")
        metadata = {"user_id": user.user_id, "plan_id": plan.plan_id}
        params: dict[str, Any] = {
            "mode": "subscription",
            "line_items": [{"price": self.price_for(plan), "quantity": 1}],
            "success_url": (
                f"{app_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
            ),
            "cancel_url": f"{app_url}/payment/cancel",
            "client_reference_id": user.user_id,
            "metadata": metadata,
            "subscription_data": {"metadata": metadata},
        }
        if user.stripe_customer_id:
            params["customer"] = user.stripe_customer_id
        else:
            params["customer_email"] = user.email
        if (
            plan.plan_id == "deans_list"
            and self.settings.stripe_deans_intro_coupon
        ):
            if not await self.deans_intro_offer_available():
                raise HTTPException(
                    status_code=503,
                    detail="Dean's List launch offer is not configured correctly",
                )
            params["discounts"] = [
                {"coupon": self.settings.stripe_deans_intro_coupon}
            ]
        result = await asyncio.to_thread(
            self.client.v1.checkout.sessions.create, params
        )
        return as_dict(result)

    async def create_portal(self, user: User) -> dict:
        result = await asyncio.to_thread(
            self.client.v1.billing_portal.sessions.create,
            {
                "customer": user.stripe_customer_id,
                "return_url": f"{str(self.settings.app_url).rstrip('/')}/settings",
            },
        )
        return as_dict(result)

    def construct_event(self, raw_body: bytes, signature: str | None) -> dict:
        if not signature or self.settings.stripe_webhook_secret is None:
            raise ValueError("Missing Stripe signature configuration")
        event = stripe.Webhook.construct_event(
            raw_body,
            signature,
            self.settings.stripe_webhook_secret.get_secret_value(),
        )
        return as_dict(event)

    @staticmethod
    async def apply_event(session: AsyncSession, event: dict) -> None:
        event_type = event.get("type", "")
        obj = as_dict(event.get("data", {}).get("object", {}))
        if event_type == "checkout.session.completed":
            await StripeBillingService._apply_checkout(session, event, obj)
        elif event_type in {
            "customer.subscription.created",
            "customer.subscription.updated",
            "customer.subscription.deleted",
        }:
            await StripeBillingService._apply_subscription(session, event, obj)
        elif event_type == "invoice.payment_failed":
            await StripeBillingService._apply_invoice_failure(session, obj)

    @staticmethod
    async def _apply_checkout(session: AsyncSession, event: dict, obj: dict) -> None:
        transaction = await session.scalar(
            select(PaymentTransaction)
            .where(PaymentTransaction.stripe_checkout_session_id == obj.get("id"))
            .with_for_update()
        )
        if transaction is None:
            raise ValueError("Checkout transaction was not initiated by Syllo")
        metadata = obj.get("metadata") or {}
        if (
            metadata.get("user_id") != transaction.user_id
            or metadata.get("plan_id") != transaction.plan_id
        ):
            raise ValueError("Checkout metadata does not match the transaction")
        occurred_at = event_time(event)
        if comparable(transaction.last_stripe_event_at) and occurred_at < comparable(
            transaction.last_stripe_event_at
        ):
            return
        if obj.get("payment_status") != "paid":
            transaction.status = str(obj.get("status") or "pending")
            transaction.last_stripe_event_at = occurred_at
            return
        user = await session.get(User, transaction.user_id, with_for_update=True)
        plan = await session.get(Plan, transaction.plan_id)
        if user is None or plan is None or not plan.active:
            raise ValueError("Checkout owner or plan is unavailable")
        transaction.status = "completed"
        transaction.payment_status = "paid"
        if obj.get("amount_total") is not None:
            transaction.amount_cents = int(obj["amount_total"])
        transaction.stripe_customer_id = obj.get("customer")
        transaction.stripe_subscription_id = obj.get("subscription")
        transaction.last_stripe_event_at = occurred_at
        user.plan_id = plan.plan_id
        user.ai_credits_remaining = plan.credits
        user.credit_period = datetime.now(timezone.utc).strftime("%Y-%m")
        user.stripe_customer_id = obj.get("customer") or user.stripe_customer_id
        user.stripe_subscription_id = (
            obj.get("subscription") or user.stripe_subscription_id
        )
        user.subscription_status = "active"

    @staticmethod
    async def _apply_subscription(
        session: AsyncSession, event: dict, obj: dict
    ) -> None:
        metadata = obj.get("metadata") or {}
        user_id = metadata.get("user_id")
        subscription_id = obj.get("id")
        user = await session.scalar(
            select(User)
            .where(
                or_(
                    User.stripe_subscription_id == subscription_id,
                    User.user_id == user_id,
                )
            )
            .with_for_update()
        )
        if user is None or (user_id and user.user_id != user_id):
            raise ValueError("Subscription owner does not match")
        transaction = await session.scalar(
            select(PaymentTransaction)
            .where(
                PaymentTransaction.user_id == user.user_id,
                or_(
                    PaymentTransaction.stripe_subscription_id == subscription_id,
                    PaymentTransaction.plan_id == metadata.get("plan_id"),
                ),
            )
            .order_by(PaymentTransaction.created_at.desc())
            .with_for_update()
        )
        if transaction is None:
            raise ValueError("Subscription has no Syllo checkout transaction")
        occurred_at = event_time(event)
        if comparable(transaction.last_stripe_event_at) and occurred_at < comparable(
            transaction.last_stripe_event_at
        ):
            return
        status = str(obj.get("status") or "unknown")
        user.stripe_subscription_id = subscription_id
        user.stripe_customer_id = obj.get("customer") or user.stripe_customer_id
        user.subscription_status = status
        transaction.stripe_subscription_id = subscription_id
        transaction.stripe_customer_id = obj.get("customer")
        transaction.last_stripe_event_at = occurred_at
        if status in {"active", "trialing"}:
            plan_id = metadata.get("plan_id")
            plan = await session.get(Plan, plan_id)
            if plan is None or not plan.active or transaction.plan_id != plan_id:
                raise ValueError("Subscription plan does not match")
            if user.plan_id != plan.plan_id:
                user.plan_id = plan.plan_id
                user.ai_credits_remaining = plan.credits
                user.credit_period = datetime.now(timezone.utc).strftime("%Y-%m")
        elif status in {"canceled", "unpaid", "incomplete_expired"}:
            freshman = await session.get(Plan, "freshman")
            user.plan_id = "freshman"
            user.ai_credits_remaining = freshman.credits if freshman else 10
            user.credit_period = datetime.now(timezone.utc).strftime("%Y-%m")
            user.credit_bonuses = {}

    @staticmethod
    async def _apply_invoice_failure(session: AsyncSession, obj: dict) -> None:
        subscription_id = obj.get("subscription")
        customer_id = obj.get("customer")
        user = await session.scalar(
            select(User)
            .where(
                or_(
                    User.stripe_subscription_id == subscription_id,
                    User.stripe_customer_id == customer_id,
                )
            )
            .with_for_update()
        )
        if user is not None:
            user.subscription_status = "past_due"
