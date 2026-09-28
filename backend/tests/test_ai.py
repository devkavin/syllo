from __future__ import annotations

import httpx
import pytest
from sqlalchemy import select

from backend.app.models import AIUsageLog, User
from backend.app.services.gemini import GenerationResult, GoogleGeminiProvider
from backend.tests.test_academic_crud import register


class FailingGemini:
    async def generate(self, **kwargs):
        raise RuntimeError("provider unavailable")


class SuccessfulGemini:
    def __init__(self) -> None:
        self.calls = []

    async def generate(self, **kwargs):
        self.calls.append(kwargs)
        return GenerationResult(
            text="A calm explanation.",
            model=kwargs["model"],
            input_tokens=24,
            output_tokens=8,
        )


class EmptyGemini:
    async def generate(self, **kwargs):
        return GenerationResult(
            text="   ", model=kwargs["model"], input_tokens=10, output_tokens=0
        )


class FakeModels:
    def __init__(self, response) -> None:
        self.response = response
        self.calls = []

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        return self.response


class FakeGoogleClient:
    def __init__(self, response) -> None:
        self.aio = type("AsyncClient", (), {"models": FakeModels(response)})()


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
    provider = SuccessfulGemini()
    app.state.gemini_service = provider
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
    assert provider.calls[0]["model"] == "gemini-3.1-flash-lite"
    async with factory() as session:
        log = await session.scalar(select(AIUsageLog))
        assert log.model == "gemini-3.1-flash-lite"
        assert log.input_tokens == 24
        assert log.output_tokens == 8


@pytest.mark.asyncio
async def test_paid_features_use_tutor_and_utility_models(sql_app) -> None:
    app, factory = sql_app
    provider = SuccessfulGemini()
    app.state.gemini_service = provider
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        async with factory() as session:
            user = await session.scalar(select(User))
            user.plan_id = "scholar"
            await session.commit()
        assert (await client.post("/api/ai/explain", json={"concept": "limits"})).status_code == 200
        assert (await client.post("/api/ai/summarize", json={"text": "A useful note"})).status_code == 200

    assert [call["model"] for call in provider.calls] == [
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
    ]


@pytest.mark.asyncio
async def test_empty_provider_response_refunds_help(sql_app) -> None:
    app, factory = sql_app
    app.state.gemini_service = EmptyGemini()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        before = (await client.get("/api/auth/me")).json()["ai_credits_remaining"]
        response = await client.post("/api/ai/explain", json={"concept": "limits"})
    async with factory() as session:
        user = await session.scalar(select(User))
        log = await session.scalar(select(AIUsageLog))
    assert response.status_code == 502
    assert user.ai_credits_remaining == before
    assert log.ok is False
    assert log.error_code == "empty_response"


@pytest.mark.asyncio
async def test_google_provider_uses_requested_model_and_records_usage() -> None:
    usage = type(
        "Usage", (), {"prompt_token_count": 31, "candidates_token_count": 12}
    )()
    response = type(
        "Response", (), {"text": "  Clear answer.  ", "usage_metadata": usage}
    )()
    client = FakeGoogleClient(response)
    provider = GoogleGeminiProvider(api_key="test-key", client=client)

    result = await provider.generate(
        model="gemini-3.1-flash-lite",
        prompt="Explain limits",
        system="Be concise",
        temperature=0.3,
        max_tokens=400,
    )

    assert result == GenerationResult(
        text="Clear answer.",
        model="gemini-3.1-flash-lite",
        input_tokens=31,
        output_tokens=12,
    )
    call = client.aio.models.calls[0]
    assert call["model"] == "gemini-3.1-flash-lite"
    assert call["contents"] == "Explain limits"
    assert call["config"].system_instruction == "Be concise"
    assert not hasattr(call["config"], "tools") or call["config"].tools is None


@pytest.mark.asyncio
async def test_rate_limit_does_not_consume_a_help(sql_app) -> None:
    app, factory = sql_app
    provider = SuccessfulGemini()
    app.state.gemini_service = provider
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        before = (await client.get("/api/auth/me")).json()["ai_credits_remaining"]
        async with factory() as session:
            user = await session.scalar(select(User))
            session.add_all(
                [
                    AIUsageLog(user_id=user.user_id, feature="chat", ok=True)
                    for _ in range(10)
                ]
            )
            await session.commit()
        response = await client.post("/api/ai/explain", json={"concept": "limits"})

    assert response.status_code == 429
    assert provider.calls == []
    async with factory() as session:
        user = await session.scalar(select(User))
        assert user.ai_credits_remaining == before


@pytest.mark.asyncio
async def test_monthly_budget_guard_does_not_consume_a_help(sql_app) -> None:
    app, factory = sql_app
    provider = SuccessfulGemini()
    app.state.gemini_service = provider
    app.state.settings.gemini_monthly_budget_cents = 1
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        await register(client, "student@example.com")
        before = (await client.get("/api/auth/me")).json()["ai_credits_remaining"]
        async with factory() as session:
            user = await session.scalar(select(User))
            session.add(
                AIUsageLog(
                    user_id=user.user_id,
                    feature="chat",
                    ok=True,
                    estimated_cost_microusd=10_000,
                )
            )
            await session.commit()
        response = await client.post("/api/ai/explain", json={"concept": "limits"})

    assert response.status_code == 503
    assert provider.calls == []
    async with factory() as session:
        user = await session.scalar(select(User))
        assert user.ai_credits_remaining == before
