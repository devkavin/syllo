from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, EmailStr, SecretStr, model_validator
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

    google_client_id: str | None = None
    google_client_secret: SecretStr | None = None
    google_redirect_uri: AnyHttpUrl | None = None
    mobile_oauth_redirect_uri: str = "syllo://google-callback"

    stripe_secret_key: SecretStr | None = None
    stripe_webhook_secret: SecretStr | None = None
    stripe_price_scholar: str | None = None
    stripe_price_deans_list: str | None = None

    admin_bootstrap_enabled: bool = False
    admin_email: EmailStr | None = None
    admin_password: SecretStr | None = None

    gemini_api_key: SecretStr | None = None

    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_recycle: int = 1800
    log_level: str = "INFO"

    @model_validator(mode="after")
    def validate_production_contract(self) -> "Settings":
        if self.environment != "production":
            return self

        required = {
            "APP_URL": self.app_url,
            "DATABASE_URL": self.database_url,
            "JWT_SECRET": self.jwt_secret,
            "OAUTH_STATE_SECRET": self.oauth_state_secret,
            "GOOGLE_CLIENT_ID": self.google_client_id,
            "GOOGLE_CLIENT_SECRET": self.google_client_secret,
            "GOOGLE_REDIRECT_URI": self.google_redirect_uri,
            "STRIPE_SECRET_KEY": self.stripe_secret_key,
            "STRIPE_WEBHOOK_SECRET": self.stripe_webhook_secret,
            "STRIPE_PRICE_SCHOLAR": self.stripe_price_scholar,
            "STRIPE_PRICE_DEANS_LIST": self.stripe_price_deans_list,
        }
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
