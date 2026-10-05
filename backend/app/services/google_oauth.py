from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from backend.app.config import Settings

STATE_ALGORITHM = "HS256"
SAFE_PROVIDER_ERRORS = frozenset(
    {"invalid_client", "invalid_grant", "invalid_request", "unauthorized_client"}
)
GOOGLE_SCOPE_ALIASES = {
    "https://www.googleapis.com/auth/userinfo.email": "email",
    "https://www.googleapis.com/auth/userinfo.profile": "profile",
}


class GoogleOAuthError(Exception):
    def __init__(self, stage: str, code: str) -> None:
        self.stage = stage
        self.code = code
        super().__init__(f"{stage}: {code}")


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    name: str
    picture: str | None = None


def validate_identity_claims(
    claims: dict[str, Any], expected_audience: str
) -> GoogleIdentity:
    audience = claims.get("aud")
    if audience != expected_audience:
        raise ValueError("Google token audience does not match")
    if claims.get("email_verified") is not True:
        raise ValueError("Google email is not verified")
    subject = str(claims.get("sub") or "").strip()
    email = str(claims.get("email") or "").strip().lower()
    if not subject or not email:
        raise ValueError("Google identity is incomplete")
    return GoogleIdentity(
        subject=subject,
        email=email,
        name=str(claims.get("name") or email.split("@", 1)[0]).strip(),
        picture=str(claims["picture"]) if claims.get("picture") else None,
    )


def safe_return_path(value: str | None) -> str:
    path = (value or "/").strip()
    if not path.startswith("/") or path.startswith("//") or "\x00" in path:
        return "/"
    return path


class OAuthStateService:
    def __init__(self, settings: Settings) -> None:
        if settings.oauth_state_secret is None:
            raise RuntimeError("OAUTH_STATE_SECRET is required for Google sign-in")
        self.secret = settings.oauth_state_secret.get_secret_value()

    def issue(self, client: str, return_to: str, referral_code: str = "") -> tuple[str, str]:
        now = datetime.now(timezone.utc)
        nonce = secrets.token_urlsafe(32)
        state = jwt.encode(
            {
                "client": client,
                "return_to": safe_return_path(return_to),
                "nonce": nonce,
                "referral_code": referral_code.strip().lower()[:12],
                "iat": now,
                "exp": now + timedelta(minutes=10),
            },
            self.secret,
            algorithm=STATE_ALGORITHM,
        )
        return state, nonce

    def decode(self, state: str) -> dict[str, Any]:
        payload = jwt.decode(state, self.secret, algorithms=[STATE_ALGORITHM])
        if payload.get("client") not in {"web", "mobile"}:
            raise JWTError("OAuth client is invalid")
        if not payload.get("nonce"):
            raise JWTError("OAuth state nonce is missing")
        payload["return_to"] = safe_return_path(payload.get("return_to"))
        return payload


class GoogleOAuthService:
    scopes = ("openid", "email", "profile")

    def __init__(self, settings: Settings) -> None:
        if not (
            settings.google_client_id
            and settings.google_client_secret
            and settings.google_redirect_uri
        ):
            raise RuntimeError("Google OAuth is not configured")
        self.client_id = settings.google_client_id
        self.client_secret = settings.google_client_secret.get_secret_value()
        self.redirect_uri = str(settings.google_redirect_uri)

    def _flow(self):
        from google_auth_oauthlib.flow import Flow

        flow = Flow.from_client_config(
            {
                "web": {
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [self.redirect_uri],
                }
            },
            scopes=list(self.scopes),
        )
        flow.redirect_uri = self.redirect_uri
        return flow

    def authorization_url(self, state: str) -> tuple[str, str]:
        flow = self._flow()
        url, _ = flow.authorization_url(
            state=state,
            access_type="online",
            prompt="select_account",
        )
        if not flow.code_verifier:
            raise RuntimeError("Google OAuth did not generate a PKCE verifier")
        return url, flow.code_verifier

    async def exchange_code(self, code: str, code_verifier: str) -> GoogleIdentity:
        import asyncio

        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2 import id_token

        flow = self._flow()
        flow.code_verifier = code_verifier
        try:
            await asyncio.to_thread(flow.fetch_token, code=code)
        except Warning as exc:
            token = getattr(exc, "token", None)
            returned_scopes = getattr(exc, "new_scope", None)
            if not isinstance(token, dict) or not isinstance(returned_scopes, list):
                raise GoogleOAuthError("token_exchange", "provider_error_Warning") from exc
            granted_scopes = {
                GOOGLE_SCOPE_ALIASES.get(scope, scope) for scope in returned_scopes
            }
            if not set(self.scopes).issubset(granted_scopes):
                raise GoogleOAuthError("token_exchange", "insufficient_scopes") from exc
            flow.oauth2session.token = token
        except Exception as exc:
            provider_code = getattr(exc, "error", None)
            safe_code = (
                provider_code
                if provider_code in SAFE_PROVIDER_ERRORS
                else f"provider_error_{type(exc).__name__}"
            )
            raise GoogleOAuthError("token_exchange", safe_code) from exc
        try:
            raw_id_token = flow.credentials.id_token
        except Exception as exc:
            raise GoogleOAuthError("id_token", "missing") from exc
        if not raw_id_token:
            raise GoogleOAuthError("id_token", "missing")
        try:
            claims = await asyncio.to_thread(
                id_token.verify_oauth2_token,
                raw_id_token,
                GoogleRequest(),
                self.client_id,
            )
        except Exception as exc:
            raise GoogleOAuthError("id_token", "verification_failed") from exc
        try:
            return validate_identity_claims(claims, self.client_id)
        except ValueError as exc:
            claim_errors = {
                "Google token audience does not match": "audience_mismatch",
                "Google email is not verified": "email_not_verified",
                "Google identity is incomplete": "incomplete_identity",
            }
            raise GoogleOAuthError(
                "identity_claims", claim_errors.get(str(exc), "invalid")
            ) from exc
