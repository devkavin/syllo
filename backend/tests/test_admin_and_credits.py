from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import select

from backend.app.models import Referral, User
from backend.app.services.credits import CreditService
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
        await session.commit()
        service = CreditService(session, app.state.settings)
        first = await service.refill_if_needed(user.user_id)
        first.ai_credits_remaining -= 1
        await session.commit()
        second = await service.refill_if_needed(user.user_id)
        assert second.ai_credits_remaining == first.ai_credits_remaining


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
        assert referrer_user.ai_credits_remaining == 25


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
