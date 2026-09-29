from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.app.config import Settings


def test_production_settings_reject_missing_required_values() -> None:
    with pytest.raises(ValidationError) as caught:
        Settings(environment="production", _env_file=None)

    message = str(caught.value)
    for variable in (
        "APP_URL",
        "DATABASE_URL",
        "JWT_SECRET",
        "OAUTH_STATE_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI",
        "GEMINI_API_KEY",
    ):
        assert variable in message


def test_production_launch_mode_does_not_require_payment_credentials(
    test_settings_values: dict[str, object],
) -> None:
    values = {
        **test_settings_values,
        "environment": "production",
        "app_url": "https://syllo.kavinhq.com",
        "database_url": "mysql+asyncmy://user:password@db.example/syllo",
        "google_client_id": "client-id",
        "google_client_secret": "google-secret",
        "google_redirect_uri": "https://syllo.kavinhq.com/api/auth/google/callback",
        "gemini_api_key": "gemini-secret",
        "billing_enabled": False,
    }
    settings = Settings(
        **values,
        _env_file=None,
    )

    assert settings.billing_enabled is False


@pytest.mark.parametrize("driver", ["mysql+pymysql", "mysql"])
def test_mysql_url_requires_async_driver(driver: str) -> None:
    with pytest.raises(
        ValidationError, match=r"DATABASE_URL must use mysql\+asyncmy://"
    ):
        Settings(
            environment="development",
            database_url=f"{driver}://user:password@db.example/syllo",
            _env_file=None,
        )


def test_production_requires_payment_credentials_when_billing_is_enabled(
    test_settings_values: dict[str, object],
) -> None:
    values = {
        **test_settings_values,
        "environment": "production",
        "app_url": "https://syllo.kavinhq.com",
        "database_url": "mysql+asyncmy://user:password@db.example/syllo",
        "google_client_id": "client-id",
        "google_client_secret": "google-secret",
        "google_redirect_uri": "https://syllo.kavinhq.com/api/auth/google/callback",
        "gemini_api_key": "gemini-secret",
        "billing_enabled": True,
    }
    with pytest.raises(ValidationError) as caught:
        Settings(
            **values,
            _env_file=None,
        )

    message = str(caught.value)
    for variable in (
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRICE_SCHOLAR",
        "STRIPE_PRICE_DEANS_LIST",
    ):
        assert variable in message


def test_admin_bootstrap_requires_admin_credentials(
    test_settings_values: dict[str, object],
) -> None:
    values = {
        **test_settings_values,
        "environment": "production",
        "app_url": "https://syllo.kavinhq.com",
        "database_url": "mysql+asyncmy://user:password@db.example/syllo",
        "google_client_id": "client-id",
        "google_client_secret": "google-secret",
        "google_redirect_uri": "https://syllo.kavinhq.com/api/auth/google/callback",
        "stripe_secret_key": "stripe-secret",
        "stripe_webhook_secret": "webhook-secret",
        "stripe_price_scholar": "price_scholar",
        "stripe_price_deans_list": "price_deans",
        "gemini_api_key": "gemini-secret",
        "admin_bootstrap_enabled": True,
    }

    with pytest.raises(ValidationError) as caught:
        Settings(**values, _env_file=None)

    message = str(caught.value)
    assert "ADMIN_EMAIL" in message
    assert "ADMIN_PASSWORD" in message


def test_client_secrets_are_not_serialized(
    test_settings_values: dict[str, object],
) -> None:
    secrets = {
        "jwt_secret": "jwt-do-not-serialize-this-secret-value",
        "oauth_state_secret": "oauth-do-not-serialize-this-secret-value",
        "google_client_secret": "google-do-not-serialize-this-secret-value",
        "stripe_secret_key": "stripe-do-not-serialize-this-secret-value",
        "stripe_webhook_secret": "webhook-do-not-serialize-this-secret-value",
        "admin_password": "admin-do-not-serialize-this-secret-value",
        "gemini_api_key": "gemini-do-not-serialize-this-secret-value",
    }
    values = {**test_settings_values, **secrets}
    settings = Settings(**values, _env_file=None)

    serialized = settings.model_dump_json()

    for value in secrets.values():
        assert value not in serialized
