from __future__ import annotations

import base64
import hashlib
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from jose import jwt
from oauthlib.oauth2.rfc6749.errors import InvalidClientError
from sqlalchemy import func, select

from backend.app.config import Settings
from backend.app.models import OAuthLoginCode, User
from backend.app.services import google_oauth
from backend.app.services.google_oauth import GoogleIdentity, validate_identity_claims


class FakeGoogleOAuth:
    def __init__(
        self, identity: GoogleIdentity | None = None, failure: Exception | None = None
    ) -> None:
        self.identity = identity or GoogleIdentity(
            subject="google-sub-1",
            email="student@example.com",
            name="Student",
            picture="https://images.example/student.png",
        )
        self.failure = failure
        self.states: list[str] = []
        self.verifiers: list[str] = []
        self.exchanged_verifiers: list[str] = []

    def authorization_url(self, state: str) -> tuple[str, str]:
        self.states.append(state)
        verifier = "v" * 43
        self.verifiers.append(verifier)
        return f"https://accounts.google.com/o/oauth2/v2/auth?state={state}&response_type=code&scope=openid+email+profile", verifier

    async def exchange_code(self, code: str, code_verifier: str) -> GoogleIdentity:
        self.exchanged_verifiers.append(code_verifier)
        if self.failure is not None:
            raise self.failure
        if code == "denied":
            raise ValueError("exchange denied")
        return self.identity


def state_from(location: str) -> str:
    return parse_qs(urlparse(location).query)["state"][0]


def test_google_authorization_exposes_matching_s256_verifier(test_settings_values) -> None:
    settings = Settings(
        **test_settings_values,
        google_client_id="client-id",
        google_client_secret="private-client-secret",
        google_redirect_uri="https://testserver/api/auth/google/callback",
        _env_file=None,
    )
    url, verifier = google_oauth.GoogleOAuthService(settings).authorization_url("state")
    params = parse_qs(urlparse(url).query)
    expected_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")

    assert 43 <= len(verifier) <= 128
    assert params["code_challenge_method"] == ["S256"]
    assert params["code_challenge"] == [expected_challenge]


@pytest.mark.asyncio
async def test_google_callback_requires_pkce_verifier_and_uses_original_value(sql_app) -> None:
    app, _ = sql_app
    fake = FakeGoogleOAuth()
    app.state.google_service = fake
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start")
        state = state_from(start.headers["location"])
        assert client.cookies.get("oauth_pkce_verifier") == fake.verifiers[0]
        client.cookies.delete("oauth_pkce_verifier")
        missing = await client.get(
            "/api/auth/google/callback", params={"code": "google-code", "state": state}
        )
        assert missing.status_code == 400
        assert not fake.exchanged_verifiers

        start = await client.get("/api/auth/google/start")
        callback = await client.get(
            "/api/auth/google/callback",
            params={"code": "google-code", "state": state_from(start.headers["location"])},
        )
        assert callback.status_code == 307
        assert fake.exchanged_verifiers == [fake.verifiers[-1]]
        assert client.cookies.get("oauth_pkce_verifier") is None


@pytest.mark.asyncio
async def test_google_callback_rejects_malformed_pkce_verifier_before_exchange(sql_app) -> None:
    app, _ = sql_app
    fake = FakeGoogleOAuth()
    app.state.google_service = fake
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start")
        client.cookies.set("oauth_pkce_verifier", "invalid!", path="/api/auth/google")
        response = await client.get(
            "/api/auth/google/callback",
            params={"code": "google-code", "state": state_from(start.headers["location"])},
        )

    assert response.status_code == 400
    assert not fake.exchanged_verifiers


@pytest.mark.asyncio
async def test_google_token_exchange_reports_safe_provider_error_code(
    monkeypatch, test_settings_values
) -> None:
    settings = Settings(
        **test_settings_values,
        google_client_id="client-id",
        google_client_secret="private-client-secret",
        google_redirect_uri="https://testserver/api/auth/google/callback",
        _env_file=None,
    )
    service = google_oauth.GoogleOAuthService(settings)

    class RejectingFlow:
        def fetch_token(self, *, code):
            assert self.code_verifier == "v" * 43
            raise InvalidClientError(description="private-client-secret")

    monkeypatch.setattr(service, "_flow", lambda: RejectingFlow())
    with pytest.raises(Exception) as caught:
        await service.exchange_code("private-authorization-code", "v" * 43)

    assert isinstance(caught.value, google_oauth.GoogleOAuthError)
    assert caught.value.stage == "token_exchange"
    assert caught.value.code == "invalid_client"
    assert "private-client-secret" not in str(caught.value)


@pytest.mark.asyncio
async def test_google_unknown_provider_failure_reports_type_not_secret(
    monkeypatch, test_settings_values
) -> None:
    settings = Settings(
        **test_settings_values,
        google_client_id="client-id",
        google_client_secret="private-client-secret",
        google_redirect_uri="https://testserver/api/auth/google/callback",
        _env_file=None,
    )
    service = google_oauth.GoogleOAuthService(settings)

    class RejectingFlow:
        def fetch_token(self, *, code):
            raise RuntimeError("private-client-secret")

    monkeypatch.setattr(service, "_flow", lambda: RejectingFlow())
    with pytest.raises(google_oauth.GoogleOAuthError) as caught:
        await service.exchange_code("private-code", "v" * 43)

    assert (caught.value.stage, caught.value.code) == (
        "token_exchange",
        "provider_error_RuntimeError",
    )
    assert "private-client-secret" not in str(caught.value)


@pytest.mark.asyncio
async def test_google_missing_id_token_has_specific_safe_code(
    monkeypatch, test_settings_values
) -> None:
    settings = Settings(
        **test_settings_values,
        google_client_id="client-id",
        google_client_secret="private-client-secret",
        google_redirect_uri="https://testserver/api/auth/google/callback",
        _env_file=None,
    )
    service = google_oauth.GoogleOAuthService(settings)
    flow = SimpleNamespace(
        fetch_token=lambda **_kwargs: None,
        credentials=SimpleNamespace(id_token=None),
    )
    monkeypatch.setattr(service, "_flow", lambda: flow)

    with pytest.raises(google_oauth.GoogleOAuthError) as caught:
        await service.exchange_code("private-authorization-code", "v" * 43)

    assert (caught.value.stage, caught.value.code) == ("id_token", "missing")


@pytest.mark.asyncio
async def test_google_id_token_verification_failure_has_specific_safe_code(
    monkeypatch, test_settings_values
) -> None:
    from google.oauth2 import id_token

    settings = Settings(
        **test_settings_values,
        google_client_id="client-id",
        google_client_secret="private-client-secret",
        google_redirect_uri="https://testserver/api/auth/google/callback",
        _env_file=None,
    )
    service = google_oauth.GoogleOAuthService(settings)
    flow = SimpleNamespace(
        fetch_token=lambda **_kwargs: None,
        credentials=SimpleNamespace(id_token="private-id-token"),
    )
    monkeypatch.setattr(service, "_flow", lambda: flow)

    def reject_token(*_args):
        raise ValueError("private-id-token")

    monkeypatch.setattr(id_token, "verify_oauth2_token", reject_token)
    with pytest.raises(google_oauth.GoogleOAuthError) as caught:
        await service.exchange_code("private-authorization-code", "v" * 43)

    assert (caught.value.stage, caught.value.code) == (
        "id_token",
        "verification_failed",
    )
    assert "private-id-token" not in str(caught.value)


@pytest.mark.asyncio
async def test_google_identity_claim_failure_reports_the_failed_check(
    monkeypatch, test_settings_values
) -> None:
    from google.oauth2 import id_token

    settings = Settings(
        **test_settings_values,
        google_client_id="client-id",
        google_client_secret="private-client-secret",
        google_redirect_uri="https://testserver/api/auth/google/callback",
        _env_file=None,
    )
    service = google_oauth.GoogleOAuthService(settings)
    flow = SimpleNamespace(
        fetch_token=lambda **_kwargs: None,
        credentials=SimpleNamespace(id_token="private-id-token"),
    )
    monkeypatch.setattr(service, "_flow", lambda: flow)
    monkeypatch.setattr(
        id_token,
        "verify_oauth2_token",
        lambda *_args: {
            "aud": "other-client",
            "email_verified": True,
            "sub": "subject-1",
            "email": "student@example.com",
        },
    )
    with pytest.raises(google_oauth.GoogleOAuthError) as caught:
        await service.exchange_code("private-authorization-code", "v" * 43)

    assert (caught.value.stage, caught.value.code) == (
        "identity_claims",
        "audience_mismatch",
    )


@pytest.mark.asyncio
async def test_google_callback_returns_safe_diagnostic_without_secrets(sql_app) -> None:
    app, _ = sql_app
    failure = google_oauth.GoogleOAuthError("token_exchange", "invalid_client")
    failure.__cause__ = RuntimeError("client_secret=private-client-secret")
    app.state.google_service = FakeGoogleOAuth(failure=failure)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start")
        callback = await client.get(
            "/api/auth/google/callback",
            params={"code": "private-code", "state": state_from(start.headers["location"])},
        )

    assert callback.status_code == 401
    assert callback.json()["detail"] == "Google sign-in failed (token_exchange: invalid_client)"
    assert "private" not in callback.text


@pytest.mark.asyncio
async def test_google_callback_identifies_unexpected_error_type_without_secrets(
    sql_app,
) -> None:
    app, _ = sql_app
    app.state.google_service = FakeGoogleOAuth(
        failure=RuntimeError("client_secret=private-client-secret")
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start")
        callback = await client.get(
            "/api/auth/google/callback",
            params={"code": "private-code", "state": state_from(start.headers["location"])},
        )

    assert callback.status_code == 401
    assert callback.json()["detail"] == "Google sign-in failed (unexpected_error: RuntimeError)"
    assert "private" not in callback.text


@pytest.mark.asyncio
async def test_google_start_has_exact_parameters_and_safe_return_path(sql_app) -> None:
    app, _ = sql_app
    fake = FakeGoogleOAuth()
    app.state.google_service = fake
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        response = await client.get(
            "/api/auth/google/start",
            params={"client": "web", "return_to": "https://evil.example/steal"},
        )

    assert response.status_code == 307
    parsed = parse_qs(urlparse(response.headers["location"]).query)
    assert parsed["response_type"] == ["code"]
    assert set(parsed["scope"][0].split()) == {"openid", "email", "profile"}
    state_payload = jwt.get_unverified_claims(fake.states[0])
    assert state_payload["client"] == "web"
    assert state_payload["return_to"] == "/"
    assert "oauth_state_nonce=" in response.headers["set-cookie"]


@pytest.mark.asyncio
async def test_web_callback_binds_state_sets_cookies_and_links_verified_account(
    sql_app,
) -> None:
    app, factory = sql_app
    app.state.google_service = FakeGoogleOAuth()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get(
            "/api/auth/google/start", params={"client": "web", "return_to": "/today"}
        )
        callback = await client.get(
            "/api/auth/google/callback",
            params={
                "code": "google-code",
                "state": state_from(start.headers["location"]),
            },
        )

    assert callback.status_code == 307
    assert callback.headers["location"] == "/today"
    assert any(
        "access_token=" in cookie for cookie in callback.headers.get_list("set-cookie")
    )
    assert "google-code" not in callback.headers["location"]
    async with factory() as session:
        user = await session.scalar(select(User))
        assert user.google_sub == "google-sub-1"
        assert user.normalized_email == "student@example.com"


@pytest.mark.asyncio
async def test_google_callback_does_not_merge_two_existing_accounts(sql_app) -> None:
    app, factory = sql_app
    async with factory() as session:
        session.add_all(
            [
                User(
                    email="first@example.com",
                    normalized_email="first@example.com",
                    name="First",
                    google_sub="google-sub-1",
                    auth_provider="google",
                    referral_code="first-ref",
                ),
                User(
                    email="student@example.com",
                    normalized_email="student@example.com",
                    name="Second",
                    auth_provider="password",
                    referral_code="second-ref",
                ),
            ]
        )
        await session.commit()
    app.state.google_service = FakeGoogleOAuth()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start", params={"client": "web"})
        response = await client.get(
            "/api/auth/google/callback",
            params={
                "code": "google-code",
                "state": state_from(start.headers["location"]),
            },
        )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_forged_or_unbound_state_fails_without_creating_user(sql_app) -> None:
    app, factory = sql_app
    app.state.google_service = FakeGoogleOAuth()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start", params={"client": "web"})
        forged = state_from(start.headers["location"]) + "x"
        response = await client.get(
            "/api/auth/google/callback", params={"code": "google-code", "state": forged}
        )
    async with factory() as session:
        count = await session.scalar(select(func.count()).select_from(User))
    assert response.status_code == 400
    assert count == 0


@pytest.mark.asyncio
async def test_mobile_callback_uses_hashed_single_use_code(sql_app) -> None:
    app, factory = sql_app
    app.state.google_service = FakeGoogleOAuth()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start", params={"client": "mobile"})
        callback = await client.get(
            "/api/auth/google/callback",
            params={
                "code": "google-code",
                "state": state_from(start.headers["location"]),
            },
        )
        deep_link = urlparse(callback.headers["location"])
        one_time_code = parse_qs(deep_link.query)["code"][0]
        first = await client.post(
            "/api/auth/google/mobile/exchange", json={"code": one_time_code}
        )
        replay = await client.post(
            "/api/auth/google/mobile/exchange", json={"code": one_time_code}
        )

    assert deep_link.scheme == "syllo"
    assert "access_token" not in parse_qs(deep_link.query)
    assert first.status_code == 200
    assert "access_token" in first.json()
    assert replay.status_code == 400
    async with factory() as session:
        stored = await session.scalar(select(OAuthLoginCode))
        assert stored.code_hash == hashlib.sha256(one_time_code.encode()).hexdigest()
        assert stored.used_at is not None


@pytest.mark.asyncio
async def test_expired_mobile_code_is_rejected(sql_app) -> None:
    app, factory = sql_app
    app.state.google_service = FakeGoogleOAuth()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://testserver",
        follow_redirects=False,
    ) as client:
        start = await client.get("/api/auth/google/start", params={"client": "mobile"})
        callback = await client.get(
            "/api/auth/google/callback",
            params={
                "code": "google-code",
                "state": state_from(start.headers["location"]),
            },
        )
        code = parse_qs(urlparse(callback.headers["location"]).query)["code"][0]
        async with factory() as session:
            stored = await session.scalar(select(OAuthLoginCode))
            stored.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            await session.commit()
        response = await client.post(
            "/api/auth/google/mobile/exchange", json={"code": code}
        )
    assert response.status_code == 400


def test_identity_claims_require_audience_verified_email_and_subject() -> None:
    good = {
        "sub": "google-sub",
        "email": "Student@Example.com",
        "email_verified": True,
        "aud": "client-id",
        "name": "Student",
    }
    assert validate_identity_claims(good, "client-id").email == "student@example.com"
    for bad in (
        {**good, "aud": "other-client"},
        {**good, "email_verified": False},
        {**good, "sub": ""},
    ):
        with pytest.raises(ValueError):
            validate_identity_claims(bad, "client-id")
