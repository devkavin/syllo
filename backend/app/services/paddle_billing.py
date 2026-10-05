"""Sandbox-only Paddle adapter. Secrets and price selection stay on the server."""
import hashlib
import hmac
import time
import httpx
from fastapi import HTTPException

API_URL = "https://sandbox-api.paddle.com"


def verify_signature(raw: bytes, signature: str, secret: str, now: float | None = None) -> bool:
    parts = {}
    for item in signature.split(";"):
        key, _, value = item.strip().partition("=")
        parts.setdefault(key, []).append(value)
    try:
        timestamp = parts["ts"][0]
        if len(parts["ts"]) != 1 or abs((now if now is not None else time.time()) - int(timestamp)) > 5:
            return False
        expected = hmac.new(secret.encode(), timestamp.encode() + b":" + raw, hashlib.sha256).hexdigest()
        return any(hmac.compare_digest(expected, value) for value in parts.get("h1", []))
    except (KeyError, ValueError, TypeError):
        return False


class PaddleBillingService:
    def __init__(self, settings, client=None):
        self.settings = settings
        self.client = client

    async def call(self, method: str, path: str, body=None):
        if not self.settings.paddle_sandbox_enabled:
            raise HTTPException(503, "Sandbox billing is not configured")
        headers = {"Authorization": f"Bearer {self.settings.paddle_api_key.get_secret_value()}"}
        try:
            if self.client:
                response = await self.client.request(method, API_URL + path, json=body, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=20) as client:
                    response = await client.request(method, API_URL + path, json=body, headers=headers)
            response.raise_for_status()
            return response.json()["data"]
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise HTTPException(502, "Paddle sandbox is unavailable. Please try again.") from exc

    def price_id(self, plan_id):
        value = {"scholar": self.settings.paddle_price_scholar, "deans_list": self.settings.paddle_price_deans_list}.get(plan_id)
        if not value:
            raise HTTPException(400, "Plan is not available for checkout")
        return value

    async def validate_catalog(self, plan, intro: bool):
        price = await self.call("GET", f"/prices/{self.price_id(plan.plan_id)}")
        if (price.get("status") != "active" or price.get("unit_price") != {"amount": str(plan.price_cents), "currency_code": "USD"}
                or price.get("billing_cycle") != {"interval": "month", "frequency": 1} or price.get("trial_period") is not None):
            raise HTTPException(503, "The sandbox price does not match the advertised plan")
        if intro:
            discount = await self.call("GET", f"/discounts/{self.settings.paddle_intro_discount_id}")
            restrict = set(discount.get("restrict_to") or [])
            if (discount.get("status") != "active" or discount.get("type") != "flat" or discount.get("amount") != "200"
                    or discount.get("currency_code") != "USD" or not discount.get("recur")
                    or discount.get("maximum_recurring_intervals") != 3
                    or self.price_id(plan.plan_id) not in restrict):
                raise HTTPException(503, "The sandbox introductory discount is not configured correctly")

    async def create_transaction(self, user, plan, reference, customer_id=None, intro=True):
        await self.validate_catalog(plan, intro)
        body = {"items": [{"price_id": self.price_id(plan.plan_id), "quantity": 1}],
                "collection_mode": "automatic", "custom_data": {"syllo_reference": reference},
                "checkout": {"url": str(self.settings.app_url).rstrip("/") + "/checkout"}}
        if customer_id:
            body["customer_id"] = customer_id
        if intro:
            body["discount_id"] = self.settings.paddle_intro_discount_id
        return await self.call("POST", "/transactions", body)
