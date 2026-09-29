from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import func, select

from backend.app.models import PaymentTransaction, StripeEvent, User
from backend.app.services.stripe_billing import StripeBillingService


class FakeWebhookStripe:
    def __init__(self, event: dict | None = None) -> None:
        self.event = event

    def construct_event(self, raw_body: bytes, signature: str | None) -> dict:
        if signature != "valid" or self.event is None:
            raise ValueError("invalid signature")
        return self.event

    async def apply_event(self, session, event: dict) -> None:
        await StripeBillingService.apply_event(session, event)


async def seed_checkout(factory) -> User:
    async with factory() as session:
        user = User(
            email="student@example.com",
            normalized_email="student@example.com",
            name="Student",
            auth_provider="password",
            referral_code="student-ref",
        )
        session.add(user)
        await session.flush()
        session.add(
            PaymentTransaction(
                user_id=user.user_id,
                plan_id="scholar",
                stripe_checkout_session_id="cs_paid",
                amount_cents=799,
            )
        )
        await session.commit()
        await session.refresh(user)
        return user


def checkout_event(
    user_id: str, *, event_id: str = "evt_paid", created: int = 10
) -> dict:
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "created": created,
        "data": {
            "object": {
                "id": "cs_paid",
                "customer": "cus_student",
                "subscription": "sub_student",
                "payment_status": "paid",
                "amount_total": 599,
                "status": "complete",
                "metadata": {"user_id": user_id, "plan_id": "scholar"},
            }
        },
    }


@pytest.mark.asyncio
async def test_webhook_rejects_missing_or_invalid_signature(sql_app) -> None:
    app, factory = sql_app
    user = await seed_checkout(factory)
    app.state.stripe_service = FakeWebhookStripe(checkout_event(user.user_id))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        missing = await client.post("/api/webhook/stripe", content=b"{}")
        invalid = await client.post(
            "/api/webhook/stripe",
            content=b"{}",
            headers={"Stripe-Signature": "invalid"},
        )
    assert missing.status_code == 400
    assert invalid.status_code == 400


@pytest.mark.asyncio
async def test_paid_checkout_is_atomic_and_duplicate_event_is_idempotent(
    sql_app,
) -> None:
    app, factory = sql_app
    user = await seed_checkout(factory)
    event = checkout_event(user.user_id)
    app.state.stripe_service = FakeWebhookStripe(event)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        first = await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )
        second = await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )
    assert first.status_code == 200
    assert second.status_code == 200
    async with factory() as session:
        stored_user = await session.get(User, user.user_id)
        transaction = await session.scalar(select(PaymentTransaction))
        event_count = await session.scalar(
            select(func.count()).select_from(StripeEvent)
        )
        assert stored_user.plan_id == "scholar"
        assert stored_user.ai_credits_remaining == 300
        assert stored_user.stripe_subscription_id == "sub_student"
        assert transaction.payment_status == "paid"
        assert transaction.amount_cents == 599
        assert event_count == 1


@pytest.mark.asyncio
async def test_wrong_user_metadata_cannot_grant_plan(sql_app) -> None:
    app, factory = sql_app
    user = await seed_checkout(factory)
    app.state.stripe_service = FakeWebhookStripe(checkout_event("attacker-user"))
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )
    assert response.status_code == 500
    async with factory() as session:
        stored_user = await session.get(User, user.user_id)
        transaction = await session.scalar(select(PaymentTransaction))
        event = await session.get(StripeEvent, "evt_paid")
        assert stored_user.plan_id == "freshman"
        assert transaction.payment_status == "pending"
        assert event.status == "failed"


@pytest.mark.asyncio
async def test_older_subscription_event_cannot_overwrite_newer_state(sql_app) -> None:
    app, factory = sql_app
    user = await seed_checkout(factory)
    paid = checkout_event(user.user_id, created=20)
    app.state.stripe_service = FakeWebhookStripe(paid)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )
        app.state.stripe_service.event = {
            "id": "evt_old_cancel",
            "type": "customer.subscription.deleted",
            "created": 10,
            "data": {
                "object": {
                    "id": "sub_student",
                    "customer": "cus_student",
                    "status": "canceled",
                    "metadata": {"user_id": user.user_id, "plan_id": "scholar"},
                }
            },
        }
        response = await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )
    assert response.status_code == 200
    async with factory() as session:
        stored_user = await session.get(User, user.user_id)
        transaction = await session.scalar(select(PaymentTransaction))
        assert stored_user.plan_id == "scholar"
        assert stored_user.subscription_status == "active"
        stored_event_at = transaction.last_stripe_event_at
        if stored_event_at.tzinfo is None:
            stored_event_at = stored_event_at.replace(tzinfo=timezone.utc)
        assert stored_event_at == datetime.fromtimestamp(20, timezone.utc)


@pytest.mark.asyncio
async def test_subscription_updates_failure_and_cancellation_update_access(
    sql_app,
) -> None:
    app, factory = sql_app
    user = await seed_checkout(factory)
    app.state.stripe_service = FakeWebhookStripe(
        checkout_event(user.user_id, created=20)
    )

    async def send(client, event: dict):
        app.state.stripe_service.event = event
        return await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )

    subscription = {
        "id": "sub_student",
        "customer": "cus_student",
        "metadata": {"user_id": user.user_id, "plan_id": "scholar"},
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await send(client, checkout_event(user.user_id, created=20))
        active = await send(
            client,
            {
                "id": "evt_active",
                "type": "customer.subscription.updated",
                "created": 21,
                "data": {"object": {**subscription, "status": "active"}},
            },
        )
        failed = await send(
            client,
            {
                "id": "evt_invoice_failed",
                "type": "invoice.payment_failed",
                "created": 22,
                "data": {
                    "object": {
                        "subscription": "sub_student",
                        "customer": "cus_student",
                    }
                },
            },
        )
        canceled = await send(
            client,
            {
                "id": "evt_canceled",
                "type": "customer.subscription.deleted",
                "created": 23,
                "data": {"object": {**subscription, "status": "canceled"}},
            },
        )

    assert [active.status_code, failed.status_code, canceled.status_code] == [
        200,
        200,
        200,
    ]
    async with factory() as session:
        stored_user = await session.get(User, user.user_id)
        assert stored_user.plan_id == "freshman"
        assert stored_user.ai_credits_remaining == 40
        assert stored_user.subscription_status == "canceled"


@pytest.mark.asyncio
async def test_repeated_active_subscription_update_does_not_refill_credits(sql_app) -> None:
    app, factory = sql_app
    user = await seed_checkout(factory)
    app.state.stripe_service = FakeWebhookStripe(
        checkout_event(user.user_id, created=20)
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )
        async with factory() as session:
            stored = await session.get(User, user.user_id)
            stored.ai_credits_remaining = 123
            await session.commit()
        app.state.stripe_service.event = {
            "id": "evt_active_again",
            "type": "customer.subscription.updated",
            "created": 21,
            "data": {
                "object": {
                    "id": "sub_student",
                    "customer": "cus_student",
                    "status": "active",
                    "metadata": {"user_id": user.user_id, "plan_id": "scholar"},
                }
            },
        }
        response = await client.post(
            "/api/webhook/stripe",
            content=b"signed",
            headers={"Stripe-Signature": "valid"},
        )

    assert response.status_code == 200
    async with factory() as session:
        stored = await session.get(User, user.user_id)
        assert stored.ai_credits_remaining == 123
