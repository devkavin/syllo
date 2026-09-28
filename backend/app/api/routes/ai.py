from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import AIUsageLog, User
from backend.app.services.credits import CreditService
from backend.app.services.progress import build_progress

router = APIRouter(prefix="/ai", tags=["study companion"])


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict[str, str]] = Field(default_factory=list)


class SummarizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)


class ExplainRequest(BaseModel):
    concept: str = Field(min_length=1, max_length=400)
    subject_name: str | None = Field(default=None, max_length=160)


def study_companion_service(request: Request):
    service = getattr(request.app.state, "gemini_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Study companion is not configured")
    return service


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
    credits = CreditService(session, request.app.state.settings)
    remaining = await credits.consume(user.user_id)
    try:
        text = await provider.generate(
            prompt=prompt,
            system=system,
            temperature=temperature,
            max_tokens=max_tokens,
        )
    except Exception as exc:
        await credits.refund(user.user_id)
        session.add(AIUsageLog(user_id=user.user_id, feature=feature, ok=False))
        await session.commit()
        raise HTTPException(
            status_code=502, detail="Study companion is temporarily unavailable"
        ) from exc
    session.add(AIUsageLog(user_id=user.user_id, feature=feature, ok=True))
    await session.commit()
    return {"text": text, "credits_remaining": remaining}


@router.post("/chat")
async def chat(
    body: ChatRequest,
    request: Request,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    history = "\n".join(
        f"{item.get('role', 'user')}: {item.get('text', '')[:4000]}"
        for item in body.history[-20:]
    )
    return await run_feature(
        feature="chat",
        prompt=f"{history}\nuser: {body.message}".strip(),
        system="Be a calm study companion. Answer clearly and concisely.",
        request=request,
        user=user,
        session=session,
        max_tokens=2000,
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
        max_tokens=1200,
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
        max_tokens=1200,
    )
