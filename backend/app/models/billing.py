from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, TimestampMixin, new_id, utc_now


class AppSetting(TimestampMixin, Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"

    plan_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    credits: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    features: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    stripe_price_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PaymentTransaction(TimestampMixin, Base):
    __tablename__ = "payment_transactions"
    __table_args__ = (
        Index("ix_payment_transactions_user_created", "user_id", "created_at"),
    )

    transaction_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL")
    )
    plan_id: Mapped[str | None] = mapped_column(
        ForeignKey("plans.plan_id", ondelete="SET NULL")
    )
    stripe_checkout_session_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), index=True)
    last_stripe_event_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="usd", nullable=False)
    status: Mapped[str] = mapped_column(String(64), default="initiated", nullable=False)
    payment_status: Mapped[str] = mapped_column(
        String(64), default="pending", nullable=False
    )


class StripeEvent(TimestampMixin, Base):
    __tablename__ = "stripe_events"

    event_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="processing", nullable=False
    )
    stripe_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)


class Referral(TimestampMixin, Base):
    __tablename__ = "referrals"
    __table_args__ = (
        Index("ix_referrals_referrer", "referrer_id"),
        Index("uq_referrals_referred", "referred_user_id", unique=True),
    )

    referral_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=new_id
    )
    referrer_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    referred_user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id"), nullable=False
    )
    credits_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AIUsageLog(Base):
    __tablename__ = "ai_usage_logs"
    __table_args__ = (
        Index("ix_ai_usage_owner_at", "user_id", "created_at"),
        Index("ix_ai_usage_created_at", "created_at"),
    )

    usage_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.user_id", ondelete="SET NULL")
    )
    feature: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str | None] = mapped_column(String(120))
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    credits: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_cost_microusd: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
