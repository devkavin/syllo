"""Account-owned, revisioned reusable scientific illustration libraries."""

from sqlalchemy import ForeignKey, Integer, JSON
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.models.base import Base, TimestampMixin


def empty_library() -> dict:
    return {"favorites": [], "recent": [], "items": []}


class ScientificLibrary(TimestampMixin, Base):
    __tablename__ = "scientific_libraries"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=empty_library)
