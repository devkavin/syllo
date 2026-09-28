from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import AIUsageLog, User
from backend.app.services.credits import CreditService
from backend.app.services.gemini import (
    EmptyGenerationError,
    GenerationResult,
    estimate_cost_microusd,
    model_for_feature,
    reserve_cost_microusd,
)
from backend.app.services.progress import build_progress

router = APIRouter(prefix="/ai", tags=["study companion"])


class ChatHistoryItem(BaseModel):
    role: Literal["user", "model"]
    text: str = Field(max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=3000)
    history: list[ChatHistoryItem] = Field(default_factory=list, max_length=12)


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=12000)


class ExplainRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=400)
    subject_name: str | None = Field(default=None, max_length=160)


def study_companion_service(request: Request):
    service = getattr(request.app.state, "gemini_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Study companion is not configured")
    return service


async def enforce_usage_guards(
    session: AsyncSession, request: Request, user: User, reserved_cost: int
) -> None:
    settings = request.app.state.settings
    one_minute_ago = datetime.now(timezone.utc) - timedelta(minutes=1)
    recent = await session.scalar(
        select(func.count())
        .select_from(AIUsageLog)
        .where(
            AIUsageLog.user_id == user.user_id,
            AIUsageLog.created_at >= one_minute_ago,
        )
    )
    if int(recent or 0) >= settings.gemini_user_requests_per_minute:
        raise HTTPException(
            status_code=429,
            detail="Please wait a moment before asking for another help.",
        )

    if settings.gemini_monthly_budget_cents > 0:
        now = datetime.now(timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        committed_and_reserved = await session.scalar(
            select(func.coalesce(func.sum(AIUsageLog.estimated_cost_microusd), 0)).where(
                AIUsageLog.created_at >= month_start
            )
        )
        if (
            int(committed_and_reserved or 0) + reserved_cost
            > settings.gemini_monthly_budget_cents * 10_000
        ):
            raise HTTPException(
                status_code=503,
                detail="Study companion is temporarily at its usage limit.",
            )


@asynccontextmanager
async def reservation_lock(request: Request, session: AsyncSession):
    bind = session.bind
    if bind is None:
        raise RuntimeError("Study companion requires a database connection")
    if bind.dialect.name == "mysql":
        async with bind.connect() as connection:
            acquired = await connection.scalar(
                text("SELECT GET_LOCK('syllo_gemini_reservation', 5)")
            )
            if acquired != 1:
                raise HTTPException(
                    status_code=503,
                    detail="Study companion is busy. Please try again shortly.",
                )
            try:
                yield
            finally:
                await connection.execute(
                    text("SELECT RELEASE_LOCK('syllo_gemini_reservation')")
                )
    else:
        async with request.app.state.gemini_reservation_lock:
            yield


async def reserve_help(
    *,
    feature: str,
    model: str,
    prompt: str,
    system: str,
    max_tokens: int,
    request: Request,
    user: User,
    session: AsyncSession,
) -> tuple[str, int]:
    reserved_cost = reserve_cost_microusd(
        model=model, prompt=prompt, system=system, max_tokens=max_tokens
    )
    async with reservation_lock(request, session):
        await enforce_usage_guards(session, request, user, reserved_cost)
        remaining = await CreditService(
            session, request.app.state.settings
        ).consume(user.user_id, commit=False)
        usage = AIUsageLog(
            user_id=user.user_id,
            feature=feature,
            model=model,
            ok=False,
            credits=0,
            estimated_cost_microusd=reserved_cost,
            error_code="pending",
        )
        session.add(usage)
        await session.commit()
        return usage.usage_id, remaining


async def run_feature(
    *,
    feature: str,
    prompt: str,
    system: str,
    request: Request,
    user: User,
    session: AsyncSession,
    temperature: float = 0.4,
    max_tokens: int = 1500,
) -> dict:
    provider = study_companion_service(request)
    model = model_for_feature(
        user.plan_id, feature, request.app.state.settings
    )
    credits = CreditService(session, request.app.state.settings)
    usage_id, remaining = await reserve_help(
        feature=feature,
        model=model,
        prompt=prompt,
        system=system,
        max_tokens=max_tokens,
        request=request,
        user=user,
        session=session,
    )
    started = perf_counter()
    try:
        result = await provider.generate(
            model=model,
            prompt=prompt,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if isinstance(result, str):
            result = GenerationResult(text=result, model=model)
        if not result.text.strip():
            raise EmptyGenerationError("Provider returned no usable content")
    except Exception as exc:
        await credits.refund(user.user_id)
        usage = await session.get(AIUsageLog, usage_id)
        usage.latency_ms = int((perf_counter() - started) * 1000)
        usage.error_code = (
            "empty_response"
            if isinstance(exc, EmptyGenerationError)
            else "provider_error"
        )
        await session.commit()
        raise HTTPException(
            status_code=502, detail="Study companion is temporarily unavailable"
        ) from exc
    try:
        usage = await session.get(AIUsageLog, usage_id)
        usage.model = result.model
        usage.ok = True
        usage.credits = 1
        usage.input_tokens = result.input_tokens
        usage.output_tokens = result.output_tokens
        usage.estimated_cost_microusd = estimate_cost_microusd(result)
        usage.latency_ms = int((perf_counter() - started) * 1000)
        usage.error_code = None
        await session.commit()
    except Exception as exc:
        await session.rollback()
        await credits.refund(user.user_id)
        try:
            usage = await session.get(AIUsageLog, usage_id)
            usage.ok = False
            usage.credits = 0
            usage.error_code = "persistence_error"
            await session.commit()
        except Exception:
            await session.rollback()
        raise HTTPException(
            status_code=502, detail="Study companion is temporarily unavailable"
        ) from exc
    return {"text": result.text.strip(), "credits_remaining": remaining}


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    history_lines = [
        f"{item.role}: {item.text}"
        for item in body.history
    ]
    history = "\n".join(history_lines)[-10_000:]
    return await run_feature(
        feature="chat",
        prompt=f"{history}\nuser: {body.message}".strip(),
        system="Be a calm study companion. Answer clearly and concisely.",
        request=request,
        user=user,
        session=session,
        max_tokens=600,
    )


@router.post("/summarize")
async def summarize(
    body: SummarizeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    return await run_feature(
        feature="summarize",
        prompt=f"Notebook content:\n\n{body.text}",
        system="Return three concise bullet points and one self-check question.",
        request=request,
        user=user,
        session=session,
        temperature=0.3,
        max_tokens=500,
    )


@router.post("/explain")
async def explain(
    body: ExplainRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    subject = f" for {body.subject_name}" if body.subject_name else ""
    return await run_feature(
        feature="explain",
        prompt=f"Explain {body.concept}{subject}.",
        system="Explain in two or three beginner-friendly sentences with a simple example.",
        request=request,
        user=user,
        session=session,
        temperature=0.3,
        max_tokens=450,
    )


@router.get("/reflection")
async def reflection(
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    progress = await build_progress(session, user.user_id)
    return await run_feature(
        feature="reflection",
        prompt=(
            f"This week: {progress['weekly_seconds']} seconds, "
            f"{progress['sessions_completed']} sessions, "
            f"{progress['lessons_studied']} lessons studied."
        ),
        system="Write a warm weekly reflection with one strength and one small next step.",
        request=request,
        user=user,
        session=session,
        temperature=0.5,
        max_tokens=350,
    )
