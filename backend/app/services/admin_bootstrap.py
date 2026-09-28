from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config import Settings
from backend.app.models import User
from backend.app.security import hash_password


@dataclass(frozen=True)
class BootstrapResult:
    status: str
    user_id: str | None = None


async def ensure_admin(
    session: AsyncSession | None,
    settings: Settings,
) -> BootstrapResult:
    if not settings.admin_bootstrap_enabled:
        return BootstrapResult(status="disabled")
    if settings.admin_email is None or settings.admin_password is None:
        raise RuntimeError(
            "ADMIN_EMAIL and ADMIN_PASSWORD are required when admin bootstrap is enabled"
        )
    if session is None:
        raise RuntimeError("A database session is required for admin bootstrap")

    normalized_email = str(settings.admin_email).strip().lower()
    user = await session.scalar(
        select(User).where(User.normalized_email == normalized_email)
    )
    if user is not None:
        if user.role != "admin":
            return BootstrapResult(status="conflict", user_id=user.user_id)
        return BootstrapResult(status="existing_admin", user_id=user.user_id)

    user = User(
        email=normalized_email,
        normalized_email=normalized_email,
        name="Administrator",
        password_hash=hash_password(settings.admin_password.get_secret_value()),
        role="admin",
        plan_id="freshman",
        auth_provider="password",
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return BootstrapResult(status="created", user_id=user.user_id)
