from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.api.routes.billing import service
from backend.app.database import get_session
from backend.app.models import StripeEvent

router = APIRouter(tags=["billing"])


@router.post("/webhook/stripe")
async def stripe_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    raw_body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    try:
        event = service(request).construct_event(raw_body, signature)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook") from exc
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    if not event_id or not event_type:
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook")
    existing = await session.get(StripeEvent, event_id)
    if existing is not None:
        if existing.status == "failed":
            raise HTTPException(
                status_code=500, detail="Stripe event processing failed"
            )
        return {"ok": True}
    record = StripeEvent(
        event_id=event_id,
        event_type=event_type,
        status="processing",
        stripe_created_at=datetime.fromtimestamp(
            int(event.get("created") or 0), timezone.utc
        ),
    )
    session.add(record)
    await session.commit()
    try:
        await service(request).apply_event(session, event)
        record = await session.get(StripeEvent, event_id)
        record.status = "processed"
        record.processed_at = datetime.now(timezone.utc)
        await session.commit()
    except Exception as exc:
        await session.rollback()
        record = await session.get(StripeEvent, event_id)
        record.status = "failed"
        record.error = str(exc)[:1000]
        await session.commit()
        raise HTTPException(
            status_code=500, detail="Stripe event processing failed"
        ) from exc
    return {"ok": True}
