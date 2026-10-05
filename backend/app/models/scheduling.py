from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Boolean, Index
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin, new_id


class AvailabilityWindow(Base):
    __tablename__ = "availability_windows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    day_of_week: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column(String(5))
    end_time: Mapped[str] = mapped_column(String(5))


class AvailabilityExclusion(Base):
    __tablename__ = "availability_exclusions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CircleStudyEvent(TimestampMixin, Base):
    __tablename__ = "circle_study_events"
    __table_args__ = (Index("ix_circle_events_dates", "circle_id", "starts_at", "ends_at"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    circle_id: Mapped[str] = mapped_column(ForeignKey("circles.circle_id", ondelete="CASCADE"))
    organizer_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    topic: Mapped[str] = mapped_column(String(160))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    canceled: Mapped[bool] = mapped_column(Boolean, default=False)


class CircleParticipation(Base):
    __tablename__ = "circle_participations"
    event_id: Mapped[str] = mapped_column(ForeignKey("circle_study_events.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="invited")
    accepted_revision: Mapped[int | None] = mapped_column(Integer)
