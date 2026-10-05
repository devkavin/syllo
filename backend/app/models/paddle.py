from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin, new_id


class PaddleAccount(TimestampMixin, Base):
    __tablename__ = "paddle_accounts"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    customer_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    subscription_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    plan_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    paid_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    scheduled_change: Mapped[str | None] = mapped_column(String(32))


class PaddlePayment(TimestampMixin, Base):
    __tablename__ = "paddle_payments"
    reference: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.plan_id"))
    transaction_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaddleEvent(TimestampMixin, Base):
    __tablename__ = "paddle_events"
    event_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(100))
