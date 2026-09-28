from __future__ import annotations

import asyncio
from dataclasses import dataclass
from math import ceil
from typing import Protocol

from google import genai
from google.genai import types

from backend.app.config import Settings


@dataclass(frozen=True)
class GenerationResult:
    text: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class EmptyGenerationError(RuntimeError):
    pass


MODEL_PRICE_HUNDREDTHS_OF_MICROUSD = {
    "gemini-3.1-flash-lite": (25, 150),
    "gemini-3.5-flash-lite": (30, 250),
    "gemini-3.8-flash": (75, 375),
}


def estimate_cost_microusd(result: GenerationResult) -> int:
    # A conservative fallback prevents a custom model override from silently
    # bypassing the application-side monthly budget.
    rates = MODEL_PRICE_HUNDREDTHS_OF_MICROUSD.get(result.model, (100, 1000))
    input_rate, output_rate = rates
    return ceil(
        (result.input_tokens * input_rate + result.output_tokens * output_rate) / 100
    )


def reserve_cost_microusd(
    *, model: str, prompt: str, system: str, max_tokens: int
) -> int:
    # Three characters per token is intentionally conservative for mixed prose,
    # equations, and markup. Reservations are reconciled to provider metadata.
    input_tokens = ceil((len(prompt) + len(system)) / 3)
    return estimate_cost_microusd(
        GenerationResult(
            text="",
            model=model,
            input_tokens=input_tokens,
            output_tokens=max_tokens,
        )
    )


def model_for_feature(plan_id: str, feature: str, settings: Settings) -> str:
    if plan_id == "freshman":
        return settings.gemini_freshman_model
    if feature in {"chat", "explain"}:
        return settings.gemini_tutor_model
    return settings.gemini_utility_model


class StudyCompanionProvider(Protocol):
    async def generate(
        self,
        *,
        model: str,
        prompt: str,
        system: str,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ) -> GenerationResult: ...


class GoogleGeminiProvider:
    def __init__(
        self,
        *,
        api_key: str,
        timeout_seconds: float = 30.0,
        client=None,
    ) -> None:
        self.client = client or genai.Client(api_key=api_key)
        self.timeout_seconds = timeout_seconds

    async def generate(
        self,
        *,
        model: str,
        prompt: str,
        system: str,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ) -> GenerationResult:
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
        async with asyncio.timeout(self.timeout_seconds):
            response = await self.client.aio.models.generate_content(
                model=model,
                contents=prompt,
                config=config,
            )
        text = (getattr(response, "text", None) or "").strip()
        if not text:
            raise EmptyGenerationError("Gemini returned no usable content")
        usage = getattr(response, "usage_metadata", None)
        return GenerationResult(
            text=text,
            model=model,
            input_tokens=int(getattr(usage, "prompt_token_count", 0) or 0),
            output_tokens=int(getattr(usage, "candidates_token_count", 0) or 0),
        )


def build_gemini_service(settings: Settings) -> GoogleGeminiProvider | None:
    if settings.gemini_api_key is None:
        return None
    return GoogleGeminiProvider(
        api_key=settings.gemini_api_key.get_secret_value(),
        timeout_seconds=settings.gemini_timeout_seconds,
    )
