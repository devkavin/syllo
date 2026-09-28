from __future__ import annotations

import httpx
import pytest
from sqlalchemy import select

from backend.app.models import AIUsageLog, User
from backend.tests.test_academic_crud import register


class FailingGemini:
    async def generate(self, **kwargs):
        raise RuntimeError("provider unavailable")


class SuccessfulGemini:
    async def generate(self, **kwargs):
        return "A calm explanation."


@pytest.mark.asyncio
async def test_ai_is_optional_and_does_not_consume_credit_when_unconfigured(
    sql_app,
) -> None:
    app, factory = sql_app
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        before = (await client.get("/api/auth/me")).json()["ai_credits_remaining"]
        response = await client.post("/api/ai/explain", json={"concept": "limits"})
    async with factory() as session:
        user = await session.scalar(select(User))
    assert response.status_code == 503
    assert user.ai_credits_remaining == before


@pytest.mark.asyncio
async def test_failed_ai_call_refunds_credit_and_logs_failure(sql_app) -> None:
    app, factory = sql_app
    app.state.gemini_service = FailingGemini()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        before = (await client.get("/api/auth/me")).json()["ai_credits_remaining"]
        response = await client.post("/api/ai/explain", json={"concept": "limits"})
    async with factory() as session:
        user = await session.scalar(select(User))
        logs = (await session.scalars(select(AIUsageLog))).all()
    assert response.status_code == 502
    assert user.ai_credits_remaining == before
    assert len(logs) == 1 and logs[0].ok is False


@pytest.mark.asyncio
async def test_successful_ai_call_consumes_one_credit(sql_app) -> None:
    app, factory = sql_app
    app.state.gemini_service = SuccessfulGemini()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        before = (await client.get("/api/auth/me")).json()["ai_credits_remaining"]
        response = await client.post("/api/ai/explain", json={"concept": "limits"})
    assert response.status_code == 200
    assert response.json() == {
        "text": "A calm explanation.",
        "credits_remaining": before - 1,
    }
