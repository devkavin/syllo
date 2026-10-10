from sqlalchemy import ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, TimestampMixin


class FocusTimer(TimestampMixin, Base):
    __tablename__ = "focus_timers"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    timer: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))
    completion: Mapped[dict | None] = mapped_column(JSON(none_as_null=True))


class FocusTimerRequest(TimestampMixin, Base):
    __tablename__ = "focus_timer_requests"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    request_id: Mapped[str] = mapped_column(String(36), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
