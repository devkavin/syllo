from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, EmailStr, Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    app_url: AnyHttpUrl | None = None
    database_url: str | None = None

    jwt_secret: SecretStr | None = None
    oauth_state_secret: SecretStr | None = None
    cookie_secure: bool = True
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    access_token_ttl_minutes: int = 10080
    refresh_token_ttl_days: int = 30

    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    google_redirect_uri: AnyHttpUrl | None = None
    mobile_oauth_redirect_uri: str = "syllo://google-callback"

    billing_enabled: bool = False
    billing_provider: Literal["paddle", "stripe"] = "paddle"
    paddle_sandbox_enabled: bool = False
    paddle_api_key: SecretStr | None = None
    paddle_webhook_secret: SecretStr | None = None
    paddle_client_token: str | None = None
    paddle_price_scholar: str | None = None
    paddle_price_deans_list: str | None = None
    paddle_intro_discount_id: str | None = None
    stripe_secret_key: SecretStr | None = None
    stripe_webhook_secret: SecretStr | None = None
    stripe_price_scholar: str | None = None
    stripe_price_deans_list: str | None = None
    stripe_deans_intro_coupon: str | None = None

    admin_bootstrap_enabled: bool = False
    admin_email: EmailStr | None = None
    admin_password: SecretStr | None = None

    gemini_api_key: SecretStr | None = None
    gemini_freshman_model: str = "gemini-3.1-flash-lite"
    gemini_tutor_model: str = "gemini-3.8-flash"
    gemini_utility_model: str = "gemini-3.5-flash-lite"
    gemini_timeout_seconds: float = Field(default=30.0, ge=1, le=120)
    gemini_user_requests_per_minute: int = Field(default=10, ge=1, le=60)
    gemini_project_requests_per_minute: int = Field(default=10, ge=1, le=600)
    gemini_monthly_budget_cents: int = Field(default=2500, ge=0)
    free_plan_start_credits: int = Field(default=10, ge=0)
    free_plan_milestone_max_credits: int = Field(default=40, ge=0)
    free_plan_max_credits: int = Field(default=100, ge=0)
    referral_bonus_credits: int = Field(default=10, ge=0)
    referral_monthly_limit: int = Field(default=5, ge=0)
    deans_intro_months: int = Field(default=3, ge=1, le=12)

    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle: int = 1800
    db_tls_allow_legacy_cert: bool = False
    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_production_contract(self) -> "Settings":
        if self.paddle_sandbox_enabled:
            required_paddle = (self.paddle_api_key, self.paddle_webhook_secret, self.paddle_client_token,
                               self.paddle_price_scholar, self.paddle_price_deans_list, self.paddle_intro_discount_id)
            if not all(required_paddle):
                raise ValueError("Paddle sandbox requires API key, webhook secret, client token, two price IDs and intro discount ID")
            if not self.paddle_api_key.get_secret_value().startswith("pdl_sdbx_apikey_") or not self.paddle_client_token.startswith("test_"):
                raise ValueError("Only Paddle sandbox credentials are supported during this launch phase")
        if self.billing_enabled and self.billing_provider == "paddle":
            raise ValueError("Public Paddle billing is not enabled yet. Use PADDLE_SANDBOX_ENABLED=true and BILLING_ENABLED=false")
        if self.database_url and self.database_url.startswith("mysql"):
            if not self.database_url.startswith("mysql+asyncmy://"):
                raise ValueError("DATABASE_URL must use mysql+asyncmy:// for MySQL")

        if self.environment != "production":
            return self

        required: dict[str, object | None] = {
            "APP_URL": self.app_url,
            "DATABASE_URL": self.database_url,
            "JWT_SECRET": self.jwt_secret,
            "OAUTH_STATE_SECRET": self.oauth_state_secret,
            "GOOGLE_CLIENT_ID": self.google_client_id,
            "GOOGLE_CLIENT_SECRET": self.google_client_secret,
            "GOOGLE_REDIRECT_URI": self.google_redirect_uri,
            "GEMINI_API_KEY": self.gemini_api_key,
        }
        if self.billing_enabled:
            required.update(
                {
                    "STRIPE_SECRET_KEY": self.stripe_secret_key,
                    "STRIPE_WEBHOOK_SECRET": self.stripe_webhook_secret,
                    "STRIPE_PRICE_SCHOLAR": self.stripe_price_scholar,
                    "STRIPE_PRICE_DEANS_LIST": self.stripe_price_deans_list,
                }
            )
        if self.admin_bootstrap_enabled:
            required.update(
                {
                    "ADMIN_EMAIL": self.admin_email,
                    "ADMIN_PASSWORD": self.admin_password,
                }
            )

        missing = [
            name for name, value in required.items() if value is None or value == ""
        ]
        if missing:
            raise ValueError(
                "Missing required production settings: " + ", ".join(missing)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
