from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from backend.app.models import Referral, User
from backend.app.services.credits import BONUS_QUESTS, CreditService
from backend.tests.test_academic_crud import register


@pytest.mark.asyncio
async def test_credit_consumption_never_goes_negative_and_refund_restores(
    sql_app,
) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
    async with factory() as session:
        user = await session.scalar(select(User))
        user.ai_credits_remaining = 1
        user.credit_period = datetime.now(timezone.utc).strftime("%Y-%m")
        user_id = user.user_id
        await session.commit()
        service = CreditService(session, app.state.settings)
        assert await service.consume(user_id) == 0
        with pytest.raises(Exception) as caught:
            await service.consume(user_id)
        assert getattr(caught.value, "status_code", None) == 402
        assert await service.refund(user_id) == 1


@pytest.mark.asyncio
async def test_monthly_refill_is_idempotent(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
    async with factory() as session:
        user = await session.scalar(select(User))
        user.ai_credits_remaining = 0
        user.credit_period = "2020-01"
        user.credit_bonuses = {"onboarded": True}
        await session.commit()
        service = CreditService(session, app.state.settings)
        first = await service.refill_if_needed(user.user_id)
        first.ai_credits_remaining -= 1
        await session.commit()
        second = await service.refill_if_needed(user.user_id)
        assert second.ai_credits_remaining == first.ai_credits_remaining
        assert second.credit_bonuses == {"onboarded": True}


@pytest.mark.asyncio
async def test_earned_freshman_helps_survive_monthly_refill(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
    async with factory() as session:
        user = await session.scalar(select(User))
        service = CreditService(session, app.state.settings)
        assert await service.grant_bonus(user.user_id, 10, 100) == 10
        for _ in range(12):
            await service.consume(user.user_id)
        user = await session.get(User, user.user_id)
        assert user.ai_credits_remaining == 8
        assert user.bonus_credits_remaining == 8
        user.credit_period = "2020-01"
        await session.commit()
        refilled = await service.refill_if_needed(user.user_id)
        assert refilled.ai_credits_remaining == 18
        assert refilled.bonus_credits_remaining == 8


@pytest.mark.asyncio
async def test_completed_starter_steps_permanently_refill_forty_helps(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        async with factory() as session:
            user = await session.scalar(select(User))
            user.credit_bonuses = {quest["id"]: True for quest in BONUS_QUESTS}
            user.ai_credits_remaining = 0
            user.bonus_credits_remaining = 0
            user.credit_period = "2020-01"
            await session.commit()

        usage = (await client.get("/api/billing/usage")).json()
        assert usage["credits_remaining"] == 40
        assert usage["monthly_allowance"] == 40

        async with factory() as session:
            user = await session.scalar(select(User))
            user.ai_credits_remaining = 0
            user.credit_period = "2020-01"
            await session.commit()

        renewed = (await client.get("/api/billing/usage")).json()
        assert renewed["credits_remaining"] == 40
        assert renewed["monthly_allowance"] == 40


@pytest.mark.asyncio
async def test_incomplete_starter_steps_refill_ten_and_preserve_referrals(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        async with factory() as session:
            user = await session.scalar(select(User))
            user.credit_bonuses = {"onboarded": True}
            user.ai_credits_remaining = 10
            user.bonus_credits_remaining = 10
            user.credit_period = "2020-01"
            await session.commit()

        usage = (await client.get("/api/billing/usage")).json()
        assert usage["credits_remaining"] == 20
        assert usage["monthly_allowance"] == 10
        assert usage["bonus_credits_remaining"] == 10


@pytest.mark.asyncio
async def test_referral_award_is_applied_once(sql_app) -> None:
    app, factory = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as referrer:
        await register(referrer, "referrer@example.com")
        code = (await referrer.get("/api/me/referrals")).json()["referral_code"]
    async with httpx.AsyncClient(
        transport=transport, base_url="http://testserver"
    ) as referred:
        response = await referred.post(
            "/api/auth/register",
            json={
                "email": "referred@example.com",
                "password": "study-pass",
                "name": "Referred",
                "referral_code": code,
            },
        )
        assert response.status_code == 200
    async with factory() as session:
        referrals = (await session.scalars(select(Referral))).all()
        assert len(referrals) == 1
        referrer_user = await session.scalar(
            select(User).where(User.normalized_email == "referrer@example.com")
        )
        assert referrer_user.ai_credits_remaining == (
            app.state.settings.free_plan_start_credits
            + app.state.settings.referral_bonus_credits
        )


def test_freshman_milestones_unlock_thirty_extra_helps() -> None:
    assert len(BONUS_QUESTS) == 5
    assert sum(quest["credits"] for quest in BONUS_QUESTS) == 30


@pytest.mark.asyncio
async def test_only_five_distinct_signup_referrals_earn_helps_each_month(sql_app) -> None:
    app, factory = sql_app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as referrer:
        await register(referrer, "referrer@example.com")
        code = (await referrer.get("/api/me/referrals")).json()["referral_code"]

    for index in range(6):
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as student:
            response = await student.post(
                "/api/auth/register",
                json={
                    "email": f"student{index}@example.com",
                    "password": "study-pass",
                    "name": f"Student {index}",
                    "referral_code": code,
                },
            )
            assert response.status_code == 200

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as referrer:
        await referrer.post(
            "/api/auth/login",
            json={"email": "referrer@example.com", "password": "study-pass"},
        )
        referral_status = (await referrer.get("/api/me/referrals")).json()
        assert referral_status["monthly_rewarded_count"] == 5
        assert referral_status["monthly_reward_limit"] == 5
        assert referral_status["monthly_credits_earned"] == 50

    async with factory() as session:
        referrer_user = await session.scalar(
            select(User).where(User.normalized_email == "referrer@example.com")
        )
        referrals = (await session.scalars(select(Referral))).all()
        assert referrer_user.ai_credits_remaining == 60
        assert sorted(referral.credits_awarded for referral in referrals) == [0, 10, 10, 10, 10, 10]

        for referral in referrals:
            if referral.credits_awarded:
                referral.created_at = datetime.now(timezone.utc) - timedelta(days=45)
        await session.commit()

    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as next_month_student:
        response = await next_month_student.post(
            "/api/auth/register",
            json={
                "email": "next-month@example.com",
                "password": "study-pass",
                "name": "Next Month",
                "referral_code": code,
            },
        )
        assert response.status_code == 200

    async with factory() as session:
        referrer_user = await session.scalar(
            select(User).where(User.normalized_email == "referrer@example.com")
        )
        assert referrer_user.ai_credits_remaining == 70


@pytest.mark.asyncio
async def test_freshman_refill_preserves_bonuses_without_exceeding_100(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
    async with factory() as session:
        user = await session.scalar(select(User))
        assert user.ai_credits_remaining == 10
        user.bonus_credits_remaining = 95
        user.ai_credits_remaining = 95
        user.credit_period = "2020-01"
        await session.commit()
        refilled = await CreditService(session, app.state.settings).refill_if_needed(user.user_id)
        assert refilled.ai_credits_remaining == 100
        assert refilled.bonus_credits_remaining == 90


@pytest.mark.asyncio
async def test_freshman_refunds_preserve_referral_capacity_to_one_hundred(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
    async with factory() as session:
        user = await session.scalar(select(User))
        user.ai_credits_remaining = 99
        await session.commit()
        remaining = await CreditService(session, app.state.settings).refund(user.user_id)
    assert remaining == 100


@pytest.mark.asyncio
async def test_milestone_claim_never_erases_referral_helps(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        async with factory() as session:
            user = await session.scalar(select(User))
            user.onboarded = True
            user.ai_credits_remaining = 90
            await session.commit()
        response = await client.post("/api/bonuses/claim/onboarded")

    assert response.status_code == 200
    assert response.json()["credits_remaining"] == 100


@pytest.mark.asyncio
async def test_admin_routes_reject_users_and_never_return_secrets(sql_app) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        assert (await client.get("/api/admin/overview")).status_code == 403
        async with factory() as session:
            user = await session.scalar(select(User))
            user.role = "admin"
            await session.commit()
        settings = await client.get("/api/admin/settings")
        body = settings.json()
        serialized = settings.text.lower()
        assert settings.status_code == 200
        assert "stripe_secret_key" not in serialized
        assert "gemini_api_key" not in serialized
        assert body["stripe_configured"] is False
        assert body["gemini_configured"] is False
        rejected = await client.patch(
            "/api/admin/settings", json={"gemini_api_key": "must-not-store"}
        )
        assert rejected.status_code == 422
