"""
costops-dev — Google Gemini Provider Adapter.

Wraps Google AI Studio's native OpenAI-compatible endpoint behind
the unified provider interface used by the CostOps gateway.

Base URL: https://generativelanguage.googleapis.com/v1beta/openai/
Auth:     Bearer <GEMINI_API_KEY>
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


class GeminiProvider:
    """Adapter for the Google Gemini chat completions API (OpenAI-compatible)."""

    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.BASE_URL,
                headers={
                    "Authorization": f"Bearer {self.settings.gemini_api_key}",
                    "Content-Type": "application/json",
                },
                timeout=httpx.Timeout(120.0),
            )
        return self._client

    async def chat_completion(
        self,
        *,
        model: str = "gemini-2.5-flash",
        messages: list[dict[str, str]],
        temperature: float = 1.0,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Send a chat completion request to Gemini and return the raw JSON."""
        client = await self._get_client()
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens

        response = await client.post("/chat/completions", json=payload)
        response.raise_for_status()
        return response.json()

    async def close(self) -> None:
        """Close the underlying HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
