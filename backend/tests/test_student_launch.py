import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from pydantic import SecretStr, ValidationError
from sqlalchemy import select

from backend.app.config import Settings
from backend.app.models import AIUsageLog, PaddleAccount, PaddlePayment, Referral, User
from backend.app.security import TokenService
from backend.app.services.gemini import GenerationResult, estimate_cost_microusd, reserve_cost_microusd
from backend.app.services.google_oauth import GoogleIdentity
from backend.app.api.routes.google_auth import resolve_google_user
from backend.app.services.paddle_billing import verify_signature, PaddleBillingService
from backend.app.services.credits import CreditService
from backend.app.services.gemini import GoogleGeminiProvider, EmptyGenerationError
from backend.app.services import gemini


async def person(factory, email, admin=False):
    async with factory() as session:
        user = User(email=email, normalized_email=email, name=email.split("@")[0], referral_code=email.split("@")[0], role="admin" if admin else "user", onboarded=True)
        session.add(user)
        await session.commit()
        return user


def headers(app, user):
    return {"Authorization": "Bearer " + TokenService(app.state.settings).issue_pair(user.user_id).access_token}


def enable(app):
    settings = app.state.settings
    settings.billing_provider = "paddle"
    settings.billing_enabled = False
    settings.paddle_sandbox_enabled = True
    settings.paddle_api_key = SecretStr("pdl_sdbx_apikey_test")
    settings.paddle_webhook_secret = SecretStr("test-secret")
    settings.paddle_client_token = "test_client"
    settings.paddle_price_scholar = "pri_scholar"
    settings.paddle_price_deans_list = "pri_deans"
    settings.paddle_intro_discount_id = "dsc_intro"


def signed(event):
    raw = json.dumps(event).encode()
    ts = str(int(time.time()))
    digest = hmac.new(b"test-secret", ts.encode() + b":" + raw, hashlib.sha256).hexdigest()
    return raw, {"Paddle-Signature": f"ts={ts};h1={digest}", "Content-Type": "application/json"}


def paid_event(reference, event_id="evt_paid", transaction="txn_owned"):
    now = datetime.now(timezone.utc)
    return {"event_id": event_id, "event_type": "transaction.completed", "occurred_at": now.isoformat(), "data": {
        "id": transaction, "status": "completed", "customer_id": "ctm_owner", "subscription_id": "sub_owner",
        "custom_data": {"syllo_reference": reference}, "items": [{"price": {"id": "pri_scholar"}, "quantity": 1}],
        "billing_period": {"ends_at": (now + timedelta(days=30)).isoformat()}}}


def test_signature_raw_body_and_expiration():
    event = {"x": "é"}
    raw, values = signed(event)
    assert verify_signature(raw, values["Paddle-Signature"], "test-secret")
    assert not verify_signature(raw + b" ", values["Paddle-Signature"], "test-secret")
    assert not verify_signature(raw, values["Paddle-Signature"], "wrong")
    assert not verify_signature(raw, values["Paddle-Signature"], "test-secret", now=time.time() + 10)
    assert not verify_signature(raw, "ts=oops;h1=no", "test-secret")


def test_cost_includes_thinking_and_reserves_unicode():
    ordinary = GenerationResult("ok", "gemini-3.1-flash-lite", 100, 100)
    thinking = GenerationResult("ok", "gemini-3.1-flash-lite", 100, 100, thinking_tokens=100)
    assert estimate_cost_microusd(thinking) == 325
    assert estimate_cost_microusd(thinking) > estimate_cost_microusd(ordinary)
    assert reserve_cost_microusd(model=ordinary.model, prompt="界" * 100, system="", max_tokens=100) == 225


def test_dated_price_increase_and_conservative_cached_input(monkeypatch):
    result = GenerationResult("ok", "gemini-3.8-flash", 100, 100)
    monkeypatch.setattr(gemini, "datetime", SimpleNamespace(now=lambda *_: datetime(2026, 10, 5, tzinfo=timezone.utc)))
    assert estimate_cost_microusd(result) == 450
    monkeypatch.setattr(gemini, "datetime", SimpleNamespace(now=lambda *_: datetime(2027, 1, 1, tzinfo=timezone.utc)))
    assert estimate_cost_microusd(result) == 900
    assert estimate_cost_microusd(GenerationResult("ok", "gemini-3.1-flash-lite", 100, cached_input_tokens=100)) == 25


def test_sandbox_rejects_live_keys_and_public_enable():
    with pytest.raises(ValidationError, match="Public Paddle"):
        Settings(billing_enabled=True, _env_file=None)
    with pytest.raises(ValidationError, match="sandbox credentials"):
        Settings(paddle_sandbox_enabled=True, paddle_api_key="pdl_live_apikey_x", paddle_client_token="live_x", paddle_webhook_secret="x", paddle_price_scholar="x", paddle_price_deans_list="y", paddle_intro_discount_id="z", _env_file=None)


@pytest.mark.asyncio
async def test_circle_privacy_permissions_rotation_and_no_rewards(sql_app):
    app, factory = sql_app
    owner = await person(factory, "owner@example.com")
    friend = await person(factory, "friend@example.com")
    stranger = await person(factory, "stranger@example.com")
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        create = await client.post("/api/circles", headers=headers(app, owner), json={"title": "Physics friends"})
        assert create.status_code == 201
        cid = create.json()["id"]
        result = (await client.get(f"/api/circles/{cid}", headers=headers(app, owner))).json()
        token = result["invite_url"].split("/join/")[1].split("?")[0]
        assert result["members"][0]["weekly_minutes"] is None
        assert (await client.get(f"/api/circles/{cid}", headers=headers(app, stranger))).status_code == 404
        preview = (await client.get(f"/api/circles/invite/{token}")).json()
        assert set(preview) == {"name", "referral_code"}
        for _ in range(2):
            assert (await client.post(f"/api/circles/invite/{token}/join", headers=headers(app, friend))).status_code == 200
        goal = (await client.post(f"/api/circles/{cid}/goals", headers=headers(app, owner), json={"title": "Read chapter 2"})).json()["id"]
        assert (await client.patch(f"/api/circles/{cid}/goals/{goal}", headers=headers(app, friend), json={"completed": True})).status_code == 404
        assert (await client.patch(f"/api/circles/{cid}/privacy", headers=headers(app, friend), json={"share_weekly_time": True})).status_code == 200
        result = (await client.get(f"/api/circles/{cid}", headers=headers(app, owner))).json()
        assert len(result["members"]) == 2
        assert next(m for m in result["members"] if m["id"] == friend.user_id)["weekly_minutes"] == 0
        assert (await client.post(f"/api/circles/{cid}/rotate-invite", headers=headers(app, friend))).status_code == 403
        assert (await client.post(f"/api/circles/{cid}/rotate-invite", headers=headers(app, owner))).status_code == 200
        assert (await client.get(f"/api/circles/invite/{token}")).status_code == 404
        assert (await client.delete(f"/api/circles/{cid}/members/{friend.user_id}", headers=headers(app, friend))).status_code == 204
        assert (await client.get(f"/api/circles/{cid}", headers=headers(app, friend))).status_code == 404
        assert (await client.post(f"/api/circles/{cid}/goals", headers=headers(app, friend), json={"title": "Should not survive removal"})).status_code == 404
    async with factory() as session:
        assert (await session.scalars(select(Referral))).all() == []


@pytest.mark.asyncio
async def test_google_new_signup_reward_is_not_repeatable(sql_app):
    app, factory = sql_app
    owner = await person(factory, "owner@example.com")
    identity = GoogleIdentity(subject="google-friend", email="google@example.com", name="Friend", picture=None)
    async with factory() as session:
        user = await resolve_google_user(session, identity, 10, app.state.settings, owner.referral_code)
        assert user.ai_credits_remaining == 20
        user = await resolve_google_user(session, identity, 10, app.state.settings, owner.referral_code)
        assert user.ai_credits_remaining == 20
        assert len((await session.scalars(select(Referral))).all()) == 1


@pytest.mark.asyncio
async def test_sandbox_visibility_and_ownership(sql_app):
    app, factory = sql_app
    enable(app)
    admin = await person(factory, "admin@example.com", True)
    student = await person(factory, "student@example.com")
    async with factory() as session:
        session.add(PaddlePayment(user_id=admin.user_id, plan_id="scholar", transaction_id="txn_owned"))
        await session.commit()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        assert (await client.get("/api/billing/plans")).json()["checkout_available"] is False
        assert (await client.get("/api/billing/plans", headers=headers(app, student))).json()["checkout_available"] is False
        assert (await client.get("/api/billing/plans", headers=headers(app, admin))).json()["sandbox"] is True
        assert (await client.post("/api/billing/checkout", headers=headers(app, student), json={"plan_id": "scholar"})).status_code == 503
        assert (await client.get("/api/billing/paddle/config", headers=headers(app, student))).status_code == 403
        assert (await client.get("/api/billing/status/txn_owned", headers=headers(app, student))).status_code == 404
        assert (await client.get("/api/billing/status/txn_owned", headers=headers(app, admin))).json()["payment_status"] == "pending"


@pytest.mark.asyncio
async def test_paid_webhook_replay_cancel_and_expiry(sql_app):
    app, factory = sql_app
    enable(app)
    user = await person(factory, "admin@example.com", True)
    async with factory() as session:
        payment = PaddlePayment(user_id=user.user_id, plan_id="scholar", transaction_id="txn_owned")
        session.add(payment)
        await session.commit()
        reference = payment.reference
    event = paid_event(reference)
    raw, signature = signed(event)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        assert (await client.post("/api/webhooks/paddle", content=raw, headers=signature)).status_code == 200
        async with factory() as session:
            assert (await session.get(User, user.user_id)).plan_id == "scholar"
            await CreditService(session, app.state.settings).consume(user.user_id)
        assert (await client.post("/api/webhooks/paddle", content=raw, headers=signature)).status_code == 200
        async with factory() as session:
            assert (await session.get(User, user.user_id)).ai_credits_remaining == 249
        cancel = {"event_id": "evt_cancel", "event_type": "subscription.canceled", "occurred_at": (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat(), "data": {"id": "sub_owner", "status": "canceled"}}
        body, sig = signed(cancel)
        assert (await client.post("/api/webhooks/paddle", content=body, headers=sig)).status_code == 200
        async with factory() as session:
            assert (await session.get(User, user.user_id)).plan_id == "freshman"
        # A newer transaction cannot reactivate a terminal canceled subscription.
        event["event_id"] = "evt_late"
        event["occurred_at"] = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
        body, sig = signed(event)
        assert (await client.post("/api/webhooks/paddle", content=body, headers=sig)).status_code == 200
        async with factory() as session:
            assert (await session.get(User, user.user_id)).plan_id == "freshman"


@pytest.mark.asyncio
async def test_webhook_rejects_price_tampering_and_bad_signatures(sql_app):
    app, factory = sql_app
    enable(app)
    user = await person(factory, "admin@example.com", True)
    async with factory() as session:
        payment = PaddlePayment(user_id=user.user_id, plan_id="scholar", transaction_id="txn_owned")
        session.add(payment)
        await session.commit()
        event = paid_event(payment.reference)
    event["data"]["items"][0]["price"]["id"] = "pri_wrong"
    raw, sig = signed(event)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        assert (await client.post("/api/webhooks/paddle", content=raw)).status_code == 400
        assert (await client.post("/api/webhooks/paddle", content=raw, headers=sig)).status_code == 400
    async with factory() as session:
        assert (await session.get(User, user.user_id)).plan_id == "freshman"


@pytest.mark.asyncio
async def test_expired_subscription_does_not_refill_paid_helps(sql_app):
    app, factory = sql_app
    user = await person(factory, "admin@example.com", True)
    async with factory() as session:
        owned = await session.get(User, user.user_id)
        owned.plan_id = "scholar"
        owned.credit_period = "2000-01"
        session.add(PaddleAccount(user_id=user.user_id, status="active", paid_through=datetime.now(timezone.utc) - timedelta(days=1)))
        await session.commit()
        result = await CreditService(session, app.state.settings).refill_if_needed(user.user_id)
        assert result.plan_id == "freshman"
        assert result.ai_credits_remaining == 10


@pytest.mark.asyncio
async def test_provider_reports_thinking_and_rejects_truncated_answer():
    response = SimpleNamespace(text="An unfinished explanation", usage_metadata=SimpleNamespace(prompt_token_count=100, candidates_token_count=40, thoughts_token_count=200, cached_content_token_count=10, total_token_count=340), candidates=[SimpleNamespace(finish_reason="MAX_TOKENS")])
    class Models:
        async def generate_content(self, **kwargs):
            return response
    provider = GoogleGeminiProvider(api_key="unused", client=SimpleNamespace(aio=SimpleNamespace(models=Models())))
    with pytest.raises(EmptyGenerationError) as raised:
        await provider.generate(model="gemini-3.1-flash-lite", prompt="explain", system="short")
    result = raised.value.result
    assert (result.thinking_tokens, result.cached_input_tokens, result.total_tokens) == (200, 10, 340)
    assert estimate_cost_microusd(result) == 385


@pytest.mark.asyncio
async def test_truncated_request_refunds_help_but_keeps_billed_cost(sql_app):
    app, factory = sql_app
    user = await person(factory, "student@example.com")
    class Provider:
        async def generate(self, **kwargs):
            raise EmptyGenerationError("truncated", GenerationResult("partial", kwargs["model"], 100, 40, thinking_tokens=200, total_tokens=340, finish_reason="MAX_TOKENS"))
    app.state.gemini_service = Provider()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        response = await client.post("/api/ai/chat", headers=headers(app, user), json={"message": "Explain limits"})
        assert response.status_code == 502
    async with factory() as session:
        log = await session.scalar(select(AIUsageLog))
        assert log.credits == 0 and log.ok is False
        assert log.thinking_tokens == 200
        assert log.estimated_cost_microusd == 385
        assert (await session.get(User, user.user_id)).ai_credits_remaining == 10


@pytest.mark.asyncio
async def test_cancellation_before_completed_payment_never_activates(sql_app):
    app, factory = sql_app
    enable(app)
    user = await person(factory, "admin@example.com", True)
    async with factory() as session:
        payment = PaddlePayment(user_id=user.user_id, plan_id="scholar", transaction_id="txn_owned")
        session.add(payment)
        await session.commit()
        event = paid_event(payment.reference)
        canceled = {"event_id": "evt_cancel_first", "event_type": "subscription.canceled", "occurred_at": (datetime.now(timezone.utc) + timedelta(seconds=1)).isoformat(),
                    "data": {"id": "sub_owner", "status": "canceled", "customer_id": "ctm_owner", "custom_data": {"syllo_reference": payment.reference}}}
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        for data in (canceled, event):
            raw, sig = signed(data)
            assert (await client.post("/api/webhooks/paddle", content=raw, headers=sig)).status_code == 200
    async with factory() as session:
        assert (await session.get(User, user.user_id)).plan_id == "freshman"


@pytest.mark.asyncio
async def test_catalog_validation_and_server_owned_checkout(sql_app):
    app, factory = sql_app
    enable(app)
    user = await person(factory, "admin@example.com", True)
    captured = []
    def handler(request):
        if "/prices/" in str(request.url):
            data = {"status": "active", "unit_price": {"amount": "899", "currency_code": "USD"}, "billing_cycle": {"interval": "month", "frequency": 1}, "trial_period": None}
        elif "/discounts/" in str(request.url):
            data = {"status": "active", "type": "flat", "amount": "200", "currency_code": "USD", "recur": True, "maximum_recurring_intervals": 3, "restrict_to": ["pri_scholar"]}
        else:
            captured.append(json.loads(request.content))
            data = {"id": "txn_created"}
        return httpx.Response(200, json={"data": data})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as provider:
        app.state.paddle_service = PaddleBillingService(app.state.settings, client=provider)
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
            result = await client.post("/api/billing/checkout", headers=headers(app, user), json={"plan_id": "scholar"})
            assert result.status_code == 200
            assert result.json()["url"] == "/checkout?_ptxn=txn_created"
            assert captured[0]["items"] == [{"price_id": "pri_scholar", "quantity": 1}]
            assert captured[0]["discount_id"] == "dsc_intro"
            assert "user_id" not in captured[0]["custom_data"]
            assert (await client.post("/api/billing/checkout", headers=headers(app, user), json={"plan_id": "deans_list"})).status_code == 409


@pytest.mark.asyncio
async def test_same_month_expiry_does_not_grant_fresh_free_helps(sql_app):
    app, factory = sql_app
    user = await person(factory, "admin@example.com", True)
    async with factory() as session:
        owned = await session.get(User, user.user_id)
        owned.plan_id = "scholar"
        owned.ai_credits_remaining = 240
        owned.credit_period = datetime.now(timezone.utc).strftime("%Y-%m")
        session.add(PaddleAccount(user_id=user.user_id, status="active", paid_through=datetime.now(timezone.utc) - timedelta(seconds=1)))
        session.add(AIUsageLog(user_id=user.user_id, feature="chat", ok=True, credits=10))
        await session.commit()
        result = await CreditService(session, app.state.settings).refill_if_needed(user.user_id)
        assert result.plan_id == "freshman" and result.ai_credits_remaining == 0


@pytest.mark.asyncio
async def test_paused_subscription_resumes_only_with_verified_paid_period(sql_app):
    app, factory = sql_app
    enable(app)
    user = await person(factory, "admin@example.com", True)
    async with factory() as session:
        session.add(PaddleAccount(user_id=user.user_id, customer_id="ctm_owner", subscription_id="sub_owner", plan_id="scholar", status="paused", paid_through=datetime.now(timezone.utc) + timedelta(days=20)))
        session.add(AIUsageLog(user_id=user.user_id, feature="chat", ok=True, credits=25))
        await session.commit()
    event = {"event_id": "evt_resumed", "event_type": "subscription.resumed", "occurred_at": datetime.now(timezone.utc).isoformat(), "data": {"id": "sub_owner", "status": "active"}}
    raw, sig = signed(event)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver") as client:
        assert (await client.post("/api/webhooks/paddle", content=raw, headers=sig)).status_code == 200
    async with factory() as session:
        result = await session.get(User, user.user_id)
        assert result.plan_id == "scholar" and result.ai_credits_remaining == 225
