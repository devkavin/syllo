from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.app.models.base import Base, TimestampMixin, new_id


class User(TimestampMixin, Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    normalized_email: Mapped[str] = mapped_column(
        String(320), nullable=False, unique=True
    )
    name: Mapped[str] = mapped_column(String(120), default="Student", nullable=False)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    role: Mapped[str] = mapped_column(String(32), default="user", nullable=False)
    plan_id: Mapped[str] = mapped_column(
        ForeignKey("plans.plan_id"), default="freshman", nullable=False, index=True
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    subscription_status: Mapped[str | None] = mapped_column(String(64))
    onboarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    daily_goal_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    ai_credits_remaining: Mapped[int] = mapped_column(
        Integer, default=10, nullable=False
    )
    credit_period: Mapped[str | None] = mapped_column(String(7))
    referral_code: Mapped[str | None] = mapped_column(String(24), unique=True)

    subjects = relationship(
        "Subject", back_populates="user", cascade="all, delete-orphan"
    )


class OAuthLoginCode(TimestampMixin, Base):
    __tablename__ = "oauth_login_codes"
    __table_args__ = (
        Index("ix_oauth_login_codes_expires_used", "expires_at", "used_at"),
    )

    code_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True
    )
    client_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
