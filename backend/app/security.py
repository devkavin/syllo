from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Response
from jose import JWTError, jwt

from backend.app.config import Settings

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (TypeError, ValueError):
        return False


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str


class TokenService:
    def __init__(self, settings: Settings) -> None:
        if settings.jwt_secret is None:
            raise RuntimeError("JWT_SECRET is required for authentication")
        self.secret = settings.jwt_secret.get_secret_value()
        self.access_ttl = timedelta(minutes=settings.access_token_ttl_minutes)
        self.refresh_ttl = timedelta(days=settings.refresh_token_ttl_days)

    def _issue(self, user_id: str, kind: str, ttl: timedelta) -> str:
        now = datetime.now(timezone.utc)
        return jwt.encode(
            {"sub": user_id, "type": kind, "iat": now, "exp": now + ttl},
            self.secret,
            algorithm=JWT_ALGORITHM,
        )

    def issue_pair(self, user_id: str) -> TokenPair:
        return TokenPair(
            access_token=self._issue(user_id, "access", self.access_ttl),
            refresh_token=self._issue(user_id, "refresh", self.refresh_ttl),
        )

    def decode(self, token: str, expected_kind: str) -> dict:
        payload = jwt.decode(token, self.secret, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != expected_kind or not payload.get("sub"):
            raise JWTError("Token kind or subject is invalid")
        return payload


def set_auth_cookies(response: Response, pair: TokenPair, settings: Settings) -> None:
    common = {
        "httponly": True,
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "path": "/",
    }
    response.set_cookie(
        "access_token",
        pair.access_token,
        max_age=settings.access_token_ttl_minutes * 60,
        **common,
    )
    response.set_cookie(
        "refresh_token",
        pair.refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        **common,
    )


def clear_auth_cookies(response: Response, settings: Settings) -> None:
    for name in ("access_token", "refresh_token"):
        response.delete_cookie(
            name,
            path="/",
            secure=settings.cookie_secure,
            httponly=True,
            samesite=settings.cookie_samesite,
        )
