import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.api.dependencies import get_current_user, require_admin
from backend.app.database import get_session
from backend.app.models import AIUsageLog, PaddleAccount, PaddleEvent, PaddlePayment, Plan, User
from backend.app.services.credits import CreditService, current_period, monthly_allowance
from backend.app.services.paddle_billing import PaddleBillingService, verify_signature

router = APIRouter(tags=["Paddle sandbox"])


def adapter(request):
    return getattr(request.app.state, "paddle_service", None) or PaddleBillingService(request.app.state.settings)


def permitted(settings, user):
    return settings.billing_provider == "paddle" and settings.paddle_sandbox_enabled and user.role == "admin"


def instant(value):
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except (ValueError, AttributeError, TypeError) as exc:
        raise HTTPException(400, "Invalid Paddle event timestamp") from exc


def aware(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


async def set_plan(session, user, plan_id, settings):
    # Changing/replaying subscriptions never tops up helps already spent this month.
    await CreditService(session, settings).refill_if_needed(user.user_id, commit=False)
    now = datetime.now(timezone.utc)
    used = int(await session.scalar(select(func.coalesce(func.sum(AIUsageLog.credits), 0)).where(
        AIUsageLog.user_id == user.user_id, AIUsageLog.created_at >= now.replace(day=1, hour=0, minute=0, second=0, microsecond=0))) or 0)
    user.plan_id = plan_id
    plan = await session.get(Plan, plan_id)
    user.bonus_credits_remaining = 0
    user.ai_credits_remaining = max(0, monthly_allowance(user, plan, settings) - used)
    user.credit_period = current_period()


async def create_checkout(body, request, user, session):
    settings = request.app.state.settings
    if not permitted(settings, user):
        raise HTTPException(503, "Paid plans are coming soon")
    user = await session.scalar(select(User).where(User.user_id == user.user_id).with_for_update())
    plan = await session.get(Plan, body.plan_id)
    if not plan or not plan.active or plan.price_cents <= 0:
        raise HTTPException(400, "Plan is not available for checkout")
    account = await session.get(PaddleAccount, user.user_id)
    if account and account.subscription_id:
        raise HTTPException(409, "Manage your existing subscription before starting another")
    # Reuse an unfinished transaction instead of creating double subscriptions.
    payment = await session.scalar(select(PaddlePayment).where(PaddlePayment.user_id == user.user_id, PaddlePayment.status == "pending").order_by(PaddlePayment.created_at.desc()))
    if payment:
        raise HTTPException(409, "An unfinished sandbox checkout exists. Resume it from the test checkout page.")
    payment = PaddlePayment(user_id=user.user_id, plan_id=plan.plan_id)
    session.add(payment)
    await session.commit()
    try:
        result = await adapter(request).create_transaction(user, plan, payment.reference,
            customer_id=account.customer_id if account else None, intro=not bool(account and account.subscription_id))
    except HTTPException as exc:
        # Definitive catalog validation failures are safe to retry. A network
        # failure may already have created a remote transaction: fail closed.
        if exc.status_code == 503:
            payment.status = "failed"
            await session.commit()
        raise
    if not result.get("id", "").startswith("txn_"):
        raise HTTPException(502, "Paddle did not create a transaction")
    payment.transaction_id = result["id"]
    await session.commit()
    return {"url": f"/checkout?_ptxn={payment.transaction_id}", "session_id": payment.transaction_id}


@router.get("/billing/paddle/config")
async def config(request: Request, user: User = Depends(require_admin)):
    if not permitted(request.app.state.settings, user):
        raise HTTPException(503, "Sandbox billing is not configured")
    return {"environment": "sandbox", "token": request.app.state.settings.paddle_client_token}


@router.get("/billing/paddle/transaction/{transaction_id}")
async def owned_transaction(transaction_id: str, request: Request, user: User = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    if not permitted(request.app.state.settings, user):
        raise HTTPException(503, "Sandbox billing is not configured")
    payment = await session.scalar(select(PaddlePayment).where(PaddlePayment.transaction_id == transaction_id, PaddlePayment.user_id == user.user_id))
    if not payment:
        raise HTTPException(404, "Payment not found")
    return {"id": payment.transaction_id, "status": payment.status}


@router.get("/billing/paddle/pending")
async def pending(request: Request, user: User = Depends(require_admin), session: AsyncSession = Depends(get_session)):
    if not permitted(request.app.state.settings, user):
        raise HTTPException(503, "Sandbox billing is not configured")
    payment = await session.scalar(select(PaddlePayment).where(PaddlePayment.user_id == user.user_id, PaddlePayment.status == "pending", PaddlePayment.transaction_id.is_not(None)).order_by(PaddlePayment.created_at.desc()))
    return {"transaction_id": payment.transaction_id if payment else None}


async def portal(request, user, session):
    if not permitted(request.app.state.settings, user):
        raise HTTPException(503, "Paid plans are coming soon")
    account = await session.get(PaddleAccount, user.user_id)
    if not account or not account.customer_id:
        raise HTTPException(400, "No billing account exists")
    result = await adapter(request).call("POST", f"/customers/{account.customer_id}/portal-sessions", {})
    url = result.get("urls", {}).get("general", {}).get("overview")
    if not url or not url.startswith("https://"):
        raise HTTPException(502, "Billing portal is unavailable")
    return {"url": url}


@router.post("/webhooks/paddle")
async def webhook(request: Request, session: AsyncSession = Depends(get_session)):
    settings = request.app.state.settings
    if not settings.paddle_sandbox_enabled or not settings.paddle_webhook_secret:
        raise HTTPException(503, "Sandbox billing is not configured")
    raw = await request.body()
    if len(raw) > 1_000_000 or not verify_signature(raw, request.headers.get("Paddle-Signature", ""), settings.paddle_webhook_secret.get_secret_value()):
        raise HTTPException(400, "Invalid Paddle signature")
    try:
        event = json.loads(raw)
        event_id, kind, data = event["event_id"], event["event_type"], event["data"]
        if not isinstance(data, dict) or not isinstance(kind, str) or not isinstance(event_id, str) or len(event_id) > 64 or len(kind) > 100:
            raise ValueError()
        occurred = instant(event["occurred_at"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(400, "Invalid Paddle event") from exc
    if await session.get(PaddleEvent, event_id):
        return {"ok": True}
    session.add(PaddleEvent(event_id=event_id, event_type=kind))
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        if await session.get(PaddleEvent, event_id):
            return {"ok": True}
        raise
    if kind.startswith("transaction."):
        transaction_id = data.get("id")
        reference = (data.get("custom_data") or {}).get("syllo_reference")
        payment = await session.scalar(select(PaddlePayment).where(PaddlePayment.transaction_id == transaction_id).with_for_update())
        if not payment and reference:
            payment = await session.get(PaddlePayment, reference)
        account = await session.scalar(select(PaddleAccount).where(PaddleAccount.subscription_id == data.get("subscription_id"))) if data.get("subscription_id") else None
        if not payment and account and kind == "transaction.completed":
            payment = PaddlePayment(user_id=account.user_id, plan_id=account.plan_id, transaction_id=transaction_id)
            session.add(payment)
        if payment and (not payment.transaction_id or payment.transaction_id == transaction_id):
            user = await session.scalar(select(User).where(User.user_id == payment.user_id).with_for_update())
            # Sandbox can never upgrade ordinary students.
            if user.role != "admin":
                raise HTTPException(400, "Invalid sandbox account")
            expected_price = adapter(request).price_id(payment.plan_id)
            items = data.get("items") or []
            if len(items) != 1 or (items[0].get("price") or {}).get("id") != expected_price or items[0].get("quantity") != 1:
                raise HTTPException(400, "Payment items do not match the selected plan")
            if not payment.last_event_at or occurred > aware(payment.last_event_at):
                payment.transaction_id = transaction_id
                payment.last_event_at = occurred
                if kind == "transaction.completed" and data.get("status") == "completed":
                    account = await session.get(PaddleAccount, user.user_id)
                    if account and account.subscription_id and account.subscription_id != data.get("subscription_id"):
                        raise HTTPException(400, "Subscription does not match this account")
                    if not data.get("customer_id") or not data.get("subscription_id"):
                        raise HTTPException(400, "Recurring payment identifiers are missing")
                    if account is None:
                        account = PaddleAccount(user_id=user.user_id)
                        session.add(account)
                    account.customer_id = data["customer_id"]
                    account.subscription_id = data["subscription_id"]
                    account.plan_id = payment.plan_id
                    period = data.get("billing_period") or {}
                    until = instant(period.get("ends_at"))
                    account.paid_through = max(aware(account.paid_through) or until, until)
                    payment.status = "paid"
                    if account.status not in {"canceled", "paused"} and until > datetime.now(timezone.utc):
                        account.status = "active"
                        await set_plan(session, user, payment.plan_id, settings)
                elif kind == "transaction.canceled":
                    payment.status = "canceled"
    elif kind.startswith("subscription."):
        account = await session.scalar(select(PaddleAccount).where(PaddleAccount.subscription_id == data.get("id")))
        if not account:
            # A cancellation/activation can arrive before the completed payment.
            # Bind through our stored checkout reference, never a supplied user ID.
            reference = (data.get("custom_data") or {}).get("syllo_reference")
            payment = await session.get(PaddlePayment, reference) if isinstance(reference, str) else None
            if payment:
                user = await session.scalar(select(User).where(User.user_id == payment.user_id).with_for_update())
                if user.role != "admin":
                    raise HTTPException(400, "Invalid sandbox account")
                account = await session.get(PaddleAccount, user.user_id)
                if account and account.subscription_id != data.get("id"):
                    raise HTTPException(400, "Subscription does not match this account")
                if account is None:
                    account = PaddleAccount(user_id=user.user_id, subscription_id=data.get("id"), customer_id=data.get("customer_id"), plan_id=payment.plan_id, status="pending")
                    session.add(account)
        if account:
            user = await session.scalar(select(User).where(User.user_id == account.user_id).with_for_update())
            if not account.last_event_at or occurred > aware(account.last_event_at):
                status = data.get("status")
                if status not in {"active", "trialing", "past_due", "paused", "canceled"}:
                    raise HTTPException(400, "Invalid subscription status")
                if account.status != "canceled":
                    account.status = status
                    account.last_event_at = occurred
                    account.scheduled_change = (data.get("scheduled_change") or {}).get("action")
                    if status in {"canceled", "paused"}:
                        await set_plan(session, user, "freshman", settings)
                    elif status == "active" and account.paid_through and aware(account.paid_through) > datetime.now(timezone.utc):
                        await set_plan(session, user, account.plan_id, settings)
    await session.commit()
    return {"ok": True}
