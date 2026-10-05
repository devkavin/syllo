from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column
from backend.app.models.base import Base, TimestampMixin, new_id


class Circle(TimestampMixin, Base):
    __tablename__ = "circles"
    circle_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    invite_token: Mapped[str] = mapped_column(String(64), unique=True)


class CircleMember(TimestampMixin, Base):
    __tablename__ = "circle_members"
    circle_id: Mapped[str] = mapped_column(ForeignKey("circles.circle_id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    share_weekly_time: Mapped[bool] = mapped_column(Boolean, default=False)
    share_availability: Mapped[bool] = mapped_column(Boolean, default=False)


class CircleGoal(TimestampMixin, Base):
    __tablename__ = "circle_goals"
    goal_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    circle_id: Mapped[str] = mapped_column(ForeignKey("circles.circle_id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(160))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.lesson_id", ondelete="SET NULL"))
    task_id: Mapped[str | None] = mapped_column(ForeignKey("tasks.task_id", ondelete="SET NULL"))
