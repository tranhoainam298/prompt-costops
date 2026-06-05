"""
costops-dev — OpenCode Provider Adapter.

Wraps the OpenCode (opencode.ai) API behind a unified provider interface.
OpenCode provides access to free models (e.g. MiniMax M3) via an
Anthropic-compatible Messages API at https://opencode.ai/zen.

The API uses the Anthropic Messages format but is accessed via OpenAI-
compatible chat/completions when proxied through our gateway.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import get_settings

logger = logging.getLogger(__name__)


class OpenCodeProvider:
    """Adapter for the OpenCode (MiniMax M3 Free) API."""

    BASE_URL = "https://opencode.ai/zen"

    def __init__(self) -> None:
        self.settings = get_settings()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.BASE_URL,
                headers={
                    "Authorization": f"Bearer {self.settings.opencode_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://costops.dev",
                    "X-Title": "CostOps Gateway",
                },
                timeout=httpx.Timeout(120.0),
            )
        return self._client

    async def chat_completion(
        self,
        *,
        model: str = "minimax-m3-free",
        messages: list[dict[str, str]],
        temperature: float = 1.0,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """Send a chat completion request to OpenCode and return the raw JSON."""
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
