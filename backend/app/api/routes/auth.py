from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.dependencies import get_current_user
from backend.app.database import get_session
from backend.app.models import User
from backend.app.schemas.auth import LoginRequest, ProfilePatch, RegisterRequest
from backend.app.security import (
    TokenService,
    clear_auth_cookies,
    hash_password,
    set_auth_cookies,
    verify_password,
)
from backend.app.services.credits import CreditService
from backend.app.services.scheduling import lock_schedule_users, user_timezone, validate_timezone_conflicts

router = APIRouter(prefix="/auth", tags=["auth"])


def serialize_user(user: User) -> dict:
    return {
        "user_id": user.user_id,
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "auth_provider": user.auth_provider,
        "onboarded": user.onboarded,
        "theme": user.theme,
        "timezone_offset_min": user.timezone_offset_min,
        "timezone": user.timezone,
        "daily_goal_minutes": user.daily_goal_minutes,
        "role": user.role,
        "plan": user.plan_id,
        "ai_credits_remaining": user.ai_credits_remaining,
        "credit_period": user.credit_period,
        "credit_bonuses": user.credit_bonuses,
        "referral_code": user.referral_code,
        "referred_by": user.referred_by,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def authenticated_response(user: User, response: Response, request: Request) -> dict:
    pair = TokenService(request.app.state.settings).issue_pair(user.user_id)
    set_auth_cookies(response, pair, request.app.state.settings)
    return {
        **serialize_user(user),
        "access_token": pair.access_token,
        "refresh_token": pair.refresh_token,
    }


@router.post("/register")
async def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    normalized_email = str(body.email).strip().lower()
    existing = await session.scalar(
        select(User.user_id).where(User.normalized_email == normalized_email)
    )
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    referrer = None
    referral_code = (body.referral_code or "").strip().lower()
    if referral_code:
        referrer = await session.scalar(
            select(User).where(User.referral_code == referral_code).with_for_update()
        )

    user = User(
        email=normalized_email,
        normalized_email=normalized_email,
        name=body.name.strip(),
        password_hash=hash_password(body.password),
        auth_provider="password",
        referral_code=secrets.token_hex(4),
        referred_by=referrer.user_id if referrer else None,
        ai_credits_remaining=(
            request.app.state.settings.free_plan_start_credits
            + (request.app.state.settings.referral_bonus_credits if referrer else 0)
        ),
        bonus_credits_remaining=(
            request.app.state.settings.referral_bonus_credits if referrer else 0
        ),
        credit_period=datetime.now(timezone.utc).strftime("%Y-%m"),
    )
    session.add(user)
    try:
        await session.flush()
        if referrer:
            await CreditService(
                session, request.app.state.settings
            ).award_signup_referral(
                referrer.user_id,
                user.user_id,
                commit=False,
            )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Email already registered") from exc
    await session.refresh(user)
    return authenticated_response(user, response, request)


@router.post("/login")
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    normalized_email = str(body.email).strip().lower()
    user = await session.scalar(
        select(User).where(User.normalized_email == normalized_email)
    )
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return authenticated_response(user, response, request)


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict[str, bool]:
    clear_auth_cookies(response, request.app.state.settings)
    return {"ok": True}


@router.get("/me")
async def me(user: User = Depends(get_current_user)) -> dict:
    return serialize_user(user)


@router.patch("/me")
async def update_me(
    body: ProfilePatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    await lock_schedule_users(session, [user.user_id])
    previous_zone = user_timezone(user)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None and field != "timezone": continue
        setattr(user, field, value.strip() if field == "name" else value)
    if user_timezone(user) != previous_zone:
        await validate_timezone_conflicts(session, user)
    await session.commit()
    await session.refresh(user)
    return serialize_user(user)


@router.post("/timezone")
async def infer_timezone(body: ProfilePatch, user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)):
    if not body.timezone: raise HTTPException(422, "Choose a valid timezone")
    await lock_schedule_users(session, [user.user_id])
    if user.timezone is None:
        previous_zone = user_timezone(user)
        user.timezone = body.timezone
        if user_timezone(user) != previous_zone:
            await validate_timezone_conflicts(session, user)
    await session.commit(); await session.refresh(user)
    return serialize_user(user)
