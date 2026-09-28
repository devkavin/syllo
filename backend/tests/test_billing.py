from __future__ import annotations

import httpx
import pytest
from sqlalchemy import select

from backend.app.config import Settings
from backend.app.models import PaymentTransaction, Plan, User
from backend.app.security import TokenService
from backend.app.services.stripe_billing import StripeBillingService


class FakeStripeBilling:
    def __init__(self) -> None:
        self.checkout_calls: list[tuple[User, Plan]] = []
        self.portal_calls: list[User] = []

    async def create_checkout(self, user: User, plan: Plan) -> dict:
        self.checkout_calls.append((user, plan))
        return {
            "id": "cs_test_owned",
            "url": "https://checkout.stripe.com/c/pay/cs_test_owned",
            "customer": user.stripe_customer_id or "cus_created",
            "subscription": None,
        }

    async def create_portal(self, user: User) -> dict:
        self.portal_calls.append(user)
        return {"url": "https://billing.stripe.com/p/session"}


class CaptureResource:
    def __init__(self, result: dict) -> None:
        self.result = result
        self.calls: list[dict] = []
        self.retrieve_calls: list[str] = []

    def create(self, params: dict) -> dict:
        self.calls.append(params)
        return self.result

    def retrieve(self, identifier: str) -> dict:
        self.retrieve_calls.append(identifier)
        return self.result


class CaptureClient:
    def __init__(self) -> None:
        self.checkout = CaptureResource(
            {"id": "cs_official", "url": "https://checkout.stripe.com/official"}
        )
        self.portal = CaptureResource({"url": "https://billing.stripe.com/official"})
        self.coupons = CaptureResource(
            {
                "id": "coupon_deans_launch",
                "valid": True,
                "amount_off": 300,
                "currency": "usd",
                "duration": "repeating",
                "duration_in_months": 3,
            }
        )
        self.v1 = type(
            "V1",
            (),
            {
                "checkout": type("Checkout", (), {"sessions": self.checkout})(),
                "billing_portal": type("Portal", (), {"sessions": self.portal})(),
                "coupons": self.coupons,
            },
        )()


async def create_user(factory, email: str = "student@example.com") -> User:
    async with factory() as session:
        user = User(
            email=email,
            normalized_email=email,
            name="Student",
            auth_provider="password",
            referral_code=email.split("@")[0],
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return user


def auth_headers(app, user: User) -> dict[str, str]:
    token = TokenService(app.state.settings).issue_pair(user.user_id).access_token
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_official_adapter_owns_price_urls_mode_and_customer_mapping() -> None:
    settings = Settings(
        environment="test",
        app_url="https://syllo.kavinhq.com",
        stripe_secret_key="sk_test_server",
        stripe_price_scholar="price_scholar_server",
        _env_file=None,
    )
    stripe_service = StripeBillingService(settings)
    stripe_service.client = CaptureClient()
    user = User(
        user_id="user-1",
        email="student@example.com",
        normalized_email="student@example.com",
        name="Student",
        stripe_customer_id="cus_existing",
    )
    plan = Plan(plan_id="scholar", name="Scholar", price_cents=799, credits=500)

    await stripe_service.create_checkout(user, plan)
    checkout = stripe_service.client.checkout.calls[0]
    assert checkout["mode"] == "subscription"
    assert checkout["line_items"] == [{"price": "price_scholar_server", "quantity": 1}]
    assert checkout["customer"] == "cus_existing"
    assert "customer_email" not in checkout
    assert checkout["metadata"] == {"user_id": "user-1", "plan_id": "scholar"}
    assert checkout["success_url"] == (
        "https://syllo.kavinhq.com/payment/success" "?session_id={CHECKOUT_SESSION_ID}"
    )

    await stripe_service.create_portal(user)
    assert stripe_service.client.portal.calls[0] == {
        "customer": "cus_existing",
        "return_url": "https://syllo.kavinhq.com/settings",
    }


@pytest.mark.asyncio
async def test_deans_checkout_applies_server_owned_three_month_coupon() -> None:
    settings = Settings(
        environment="test",
        app_url="https://syllo.kavinhq.com",
        stripe_secret_key="sk_test_server",
        stripe_price_deans_list="price_deans_server",
        stripe_deans_intro_coupon="coupon_deans_launch",
        _env_file=None,
    )
    stripe_service = StripeBillingService(settings)
    stripe_service.client = CaptureClient()
    user = User(
        user_id="user-1",
        email="student@example.com",
        normalized_email="student@example.com",
        name="Student",
    )
    plan = Plan(plan_id="deans_list", name="Dean's List", price_cents=1299, credits=1500)

    await stripe_service.create_checkout(user, plan)

    checkout = stripe_service.client.checkout.calls[0]
    assert checkout["discounts"] == [{"coupon": "coupon_deans_launch"}]
    assert stripe_service.client.coupons.retrieve_calls == ["coupon_deans_launch"]


@pytest.mark.asyncio
async def test_deans_checkout_fails_closed_for_misconfigured_coupon() -> None:
    settings = Settings(
        environment="test",
        app_url="https://syllo.kavinhq.com",
        stripe_secret_key="sk_test_server",
        stripe_price_deans_list="price_deans_server",
        stripe_deans_intro_coupon="coupon_wrong",
        _env_file=None,
    )
    stripe_service = StripeBillingService(settings)
    stripe_service.client = CaptureClient()
    stripe_service.client.coupons.result = {
        "valid": True,
        "amount_off": 100,
        "currency": "usd",
        "duration": "forever",
    }
    user = User(
        user_id="user-1",
        email="student@example.com",
        normalized_email="student@example.com",
        name="Student",
    )
    plan = Plan(plan_id="deans_list", name="Dean's List", price_cents=1299, credits=1500)

    with pytest.raises(Exception) as caught:
        await stripe_service.create_checkout(user, plan)

    assert getattr(caught.value, "status_code", None) == 503
    assert stripe_service.client.checkout.calls == []


@pytest.mark.asyncio
async def test_checkout_uses_owned_plan_and_rejects_client_billing_fields(
    sql_app,
) -> None:
    app, factory = sql_app
    fake = FakeStripeBilling()
    app.state.stripe_service = fake
    user = await create_user(factory)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        rejected = await client.post(
            "/api/billing/checkout",
            headers=auth_headers(app, user),
            json={
                "plan_id": "scholar",
                "price_id": "price_attacker",
                "amount": 1,
                "origin_url": "https://evil.example",
            },
        )
        response = await client.post(
            "/api/billing/checkout",
            headers=auth_headers(app, user),
            json={"plan_id": "scholar"},
        )

    assert rejected.status_code == 422
    assert response.status_code == 200
    assert response.json() == {
        "url": "https://checkout.stripe.com/c/pay/cs_test_owned",
        "session_id": "cs_test_owned",
    }
    assert fake.checkout_calls[0][0].user_id == user.user_id
    assert fake.checkout_calls[0][1].plan_id == "scholar"
    async with factory() as session:
        transaction = await session.scalar(select(PaymentTransaction))
        assert transaction.user_id == user.user_id
        assert transaction.plan_id == "scholar"
        assert transaction.amount_cents == 599


@pytest.mark.asyncio
async def test_checkout_rejects_free_unknown_and_inactive_plans(sql_app) -> None:
    app, factory = sql_app
    app.state.stripe_service = FakeStripeBilling()
    user = await create_user(factory)
    async with factory() as session:
        plan = await session.get(Plan, "scholar")
        plan.active = False
        await session.commit()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        statuses = []
        for plan_id in ("freshman", "missing", "scholar"):
            response = await client.post(
                "/api/billing/checkout",
                headers=auth_headers(app, user),
                json={"plan_id": plan_id},
            )
            statuses.append(response.status_code)
    assert statuses == [400, 404, 400]


@pytest.mark.asyncio
async def test_billing_status_is_owner_scoped(sql_app) -> None:
    app, factory = sql_app
    owner = await create_user(factory, "owner@example.com")
    stranger = await create_user(factory, "stranger@example.com")
    async with factory() as session:
        session.add(
            PaymentTransaction(
                user_id=owner.user_id,
                plan_id="scholar",
                stripe_checkout_session_id="cs_private",
                amount_cents=799,
            )
        )
        await session.commit()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        hidden = await client.get(
            "/api/billing/status/cs_private", headers=auth_headers(app, stranger)
        )
        visible = await client.get(
            "/api/billing/status/cs_private", headers=auth_headers(app, owner)
        )
    assert hidden.status_code == 404
    assert visible.status_code == 200
    assert visible.json()["payment_status"] == "pending"


@pytest.mark.asyncio
async def test_portal_requires_an_existing_stripe_customer(sql_app) -> None:
    app, factory = sql_app
    fake = FakeStripeBilling()
    app.state.stripe_service = fake
    user = await create_user(factory)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        missing = await client.post(
            "/api/billing/portal", headers=auth_headers(app, user), json={}
        )
        async with factory() as session:
            stored = await session.get(User, user.user_id)
            stored.stripe_customer_id = "cus_existing"
            await session.commit()
        opened = await client.post(
            "/api/billing/portal", headers=auth_headers(app, user), json={}
        )
    assert missing.status_code == 400
    assert opened.status_code == 200
    assert opened.json()["url"].startswith("https://billing.stripe.com/")
