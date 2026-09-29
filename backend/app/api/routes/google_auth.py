from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.routes.auth import authenticated_response
from backend.app.database import get_session
from backend.app.models import OAuthLoginCode, User
from backend.app.services.google_oauth import (
    GoogleIdentity,
    GoogleOAuthError,
    GoogleOAuthService,
    OAuthStateService,
)

router = APIRouter(prefix="/auth/google", tags=["auth"])
STATE_COOKIE = "oauth_state_nonce"
PKCE_COOKIE = "oauth_pkce_verifier"
PKCE_VERIFIER_PATTERN = re.compile(r"[A-Za-z0-9._~-]{43,128}\Z")


class MobileCodeRequest(BaseModel):
    code: str = Field(min_length=20, max_length=200)


def google_service(request: Request):
    service = request.app.state.google_service
    if service is None:
        service = GoogleOAuthService(request.app.state.settings)
        request.app.state.google_service = service
    return service


def append_query(uri: str, **values: str) -> str:
    parts = urlsplit(uri)
    query = dict(parse_qsl(parts.query))
    query.update(values)
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)
    )


async def resolve_google_user(
    session: AsyncSession,
    identity: GoogleIdentity,
) -> User:
    subject_user = await session.scalar(
        select(User).where(User.google_sub == identity.subject)
    )
    email_user = await session.scalar(
        select(User).where(User.normalized_email == identity.email)
    )
    if (
        subject_user is not None
        and email_user is not None
        and subject_user != email_user
    ):
        raise HTTPException(status_code=409, detail="Google account conflict")
    user = subject_user or email_user
    if user is not None:
        if user.google_sub and user.google_sub != identity.subject:
            raise HTTPException(status_code=409, detail="Google account conflict")
        user.google_sub = identity.subject
        user.auth_provider = (
            "google" if user.password_hash is None else user.auth_provider
        )
        user.name = user.name or identity.name
        user.picture = identity.picture or user.picture
    else:
        user = User(
            email=identity.email,
            normalized_email=identity.email,
            name=identity.name,
            picture=identity.picture,
            google_sub=identity.subject,
            auth_provider="google",
            referral_code=secrets.token_hex(4),
            credit_period=datetime.now(timezone.utc).strftime("%Y-%m"),
        )
        session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.get("/start")
async def google_start(
    request: Request,
    client: str = Query(default="web", pattern="^(web|mobile)$"),
    return_to: str = "/",
) -> RedirectResponse:
    state, nonce = OAuthStateService(request.app.state.settings).issue(
        client, return_to
    )
    authorization_url, code_verifier = google_service(request).authorization_url(state)
    response = RedirectResponse(
        authorization_url, status_code=307
    )
    response.set_cookie(
        STATE_COOKIE,
        nonce,
        max_age=600,
        httponly=True,
        secure=request.app.state.settings.cookie_secure,
        samesite="lax",
        path="/api/auth/google",
    )
    response.set_cookie(
        PKCE_COOKIE,
        code_verifier,
        max_age=600,
        httponly=True,
        secure=request.app.state.settings.cookie_secure,
        samesite="lax",
        path="/api/auth/google",
    )
    return response


@router.get("/callback")
async def google_callback(
    request: Request,
    code: str,
    state: str,
    session: AsyncSession = Depends(get_session),
) -> Response:
    try:
        payload = OAuthStateService(request.app.state.settings).decode(state)
    except JWTError as exc:
        raise HTTPException(
            status_code=400, detail="Invalid or expired OAuth state"
        ) from exc
    cookie_nonce = request.cookies.get(STATE_COOKIE)
    if not cookie_nonce or not secrets.compare_digest(cookie_nonce, payload["nonce"]):
        raise HTTPException(
            status_code=400, detail="OAuth state is not bound to this browser"
        )
    code_verifier = request.cookies.get(PKCE_COOKIE)
    if not code_verifier or not PKCE_VERIFIER_PATTERN.fullmatch(code_verifier):
        raise HTTPException(
            status_code=400, detail="Google sign-in session expired. Please try again."
        )
    try:
        identity = await google_service(request).exchange_code(code, code_verifier)
    except GoogleOAuthError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Google sign-in failed ({exc.stage}: {exc.code})",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Google sign-in failed (unexpected_error: {type(exc).__name__})",
        ) from exc
    user = await resolve_google_user(session, identity)

    if payload["client"] == "mobile":
        raw_code = secrets.token_urlsafe(32)
        session.add(
            OAuthLoginCode(
                code_hash=hashlib.sha256(raw_code.encode()).hexdigest(),
                user_id=user.user_id,
                client_kind="mobile",
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
            )
        )
        await session.commit()
        location = append_query(
            request.app.state.settings.mobile_oauth_redirect_uri, code=raw_code
        )
    else:
        location = payload["return_to"]

    response = RedirectResponse(location, status_code=307)
    response.delete_cookie(STATE_COOKIE, path="/api/auth/google")
    response.delete_cookie(PKCE_COOKIE, path="/api/auth/google")
    if payload["client"] == "web":
        authenticated_response(user, response, request)
    return response


@router.post("/mobile/exchange")
async def mobile_exchange(
    body: MobileCodeRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> dict:
    code_hash = hashlib.sha256(body.code.encode()).hexdigest()
    stored = await session.scalar(
        select(OAuthLoginCode)
        .where(OAuthLoginCode.code_hash == code_hash)
        .with_for_update()
    )
    now = datetime.now(timezone.utc)
    expires_at = (
        stored.expires_at.replace(tzinfo=timezone.utc)
        if stored and stored.expires_at.tzinfo is None
        else (stored.expires_at if stored else now)
    )
    if (
        stored is None
        or stored.client_kind != "mobile"
        or stored.used_at is not None
        or expires_at <= now
    ):
        await session.rollback()
        raise HTTPException(status_code=400, detail="Login code is invalid or expired")
    stored.used_at = now
    user = await session.get(User, stored.user_id)
    if user is None:
        await session.rollback()
        raise HTTPException(status_code=400, detail="Login code is invalid or expired")
    await session.commit()
    return authenticated_response(user, response, request)
