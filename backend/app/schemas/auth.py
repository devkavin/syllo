from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=120)
    referral_code: str | None = Field(default=None, max_length=24)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfilePatch(BaseModel):
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value):
        if value is not None:
            try: ZoneInfo(value)
            except (ZoneInfoNotFoundError, ValueError): raise ValueError("Choose a valid timezone")
        return value

    name: str | None = Field(default=None, min_length=1, max_length=120)
    theme: str | None = Field(default=None, pattern="^(light|dark|system)$")
    timezone_offset_min: int | None = Field(default=None, ge=-840, le=840)
    onboarded: bool | None = None
    daily_goal_minutes: int | None = Field(default=None, ge=1, le=1440)
