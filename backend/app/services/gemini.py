from __future__ import annotations

from typing import Protocol


class StudyCompanionProvider(Protocol):
    async def generate(
        self,
        *,
        prompt: str,
        system: str,
        temperature: float = 0.4,
        max_tokens: int = 1500,
    ) -> str: ...
