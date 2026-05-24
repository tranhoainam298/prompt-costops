"""
costops-dev — OpenAI-Compatible Chat Completions Endpoint (Streaming).

POST /v1/chat/completions

This module implements the **production** version of the endpoint:

  1. Intercepts the incoming OpenAI-compatible JSON payload.
  2. Extracts the latest user message.
  3. Runs the text through ``PromptOptimizationEngine`` to compress and route.
  4. Opens an async streaming connection (``httpx``) to the chosen upstream
     provider (OpenAI / DeepSeek / Anthropic-compatible).
  5. Relays each SSE chunk back to the caller in real time via
     ``StreamingResponse(media_type="text/event-stream")``.
  6. After the stream finishes, a **background task** atomically deducts
     used tokens from the user's ``TokenWallet`` and writes a ``PromptLog``
     audit record.

Both ``stream: true`` and ``stream: false`` modes are supported.
"""

from __future__ import annotations

import json
import time
import uuid
import logging
from typing import Any, AsyncGenerator

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import async_session_factory, get_db
from app.models.models import PromptLog, TokenWallet
from app.pipeline.engine import PromptOptimizationEngine
from app.pipeline.router import MODEL_CATALOG
from app.services.token_counter import TokenCounter

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/v1", tags=["chat"])

# ── Singletons ───────────────────────────────────────────

_engine = PromptOptimizationEngine()
_counter = TokenCounter(model="gpt-4o")

# ── Provider endpoint / key mapping ─────────────────────

_PROVIDER_CONFIG: dict[str, dict[str, str]] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "key_attr": "openai_api_key",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "key_attr": "deepseek_api_key",
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "key_attr": "anthropic_api_key",
    },
}


# ── Request / Response Schemas ───────────────────────────


class ChatMessage(BaseModel):
    """A single message in the conversation."""
    role: str = "user"
    content: str = ""


class ChatCompletionRequest(BaseModel):
    """OpenAI-compatible chat completion request."""
    model: str = "gpt-4o"
    messages: list[ChatMessage]
    temperature: float = Field(default=1.0, ge=0.0, le=2.0)
    max_tokens: int | None = None
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    frequency_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    presence_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    stream: bool = False
    user: str | None = None


class UsageInfo(BaseModel):
    """Token usage statistics returned in non-streaming responses."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    prompt_tokens_before_optimization: int = 0
    tokens_saved: int = 0
    compression_ratio: float = 0.0


class ChoiceMessage(BaseModel):
    """Message inside a non-streaming choice."""
    role: str = "assistant"
    content: str


class Choice(BaseModel):
    """A single completion choice (non-streaming)."""
    index: int = 0
    message: ChoiceMessage
    finish_reason: str = "stop"


class ChatCompletionResponse(BaseModel):
    """Full OpenAI-compatible response for non-streaming mode."""
    id: str
    object: str = "chat.completion"
    created: int
    model: str
    choices: list[Choice]
    usage: UsageInfo
    system_fingerprint: str = "costops-v0.2"


# ── Helpers ──────────────────────────────────────────────


def _extract_last_user_message(messages: list[ChatMessage]) -> str:
    """Return the content of the most recent user message."""
    for msg in reversed(messages):
        if msg.role == "user" and msg.content:
            return msg.content
    return ""


def _build_provider_headers(provider: str) -> dict[str, str]:
    """Return the HTTP headers required by *provider*."""
    cfg = _PROVIDER_CONFIG.get(provider, _PROVIDER_CONFIG["openai"])
    api_key = getattr(settings, cfg["key_attr"], "")

    if provider == "anthropic":
        return {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def _build_upstream_url(provider: str) -> str:
    """Return the full chat-completions URL for *provider*."""
    cfg = _PROVIDER_CONFIG.get(provider, _PROVIDER_CONFIG["openai"])
    base = cfg["base_url"].rstrip("/")
    if provider == "anthropic":
        return f"{base}/messages"
    return f"{base}/chat/completions"


def _build_upstream_payload(
    payload: ChatCompletionRequest,
    optimized_messages: list[dict[str, str]],
    model_used: str,
    *,
    stream: bool,
) -> dict[str, Any]:
    """Assemble the JSON body sent to the upstream provider."""
    body: dict[str, Any] = {
        "model": model_used,
        "messages": optimized_messages,
        "temperature": payload.temperature,
        "top_p": payload.top_p,
        "frequency_penalty": payload.frequency_penalty,
        "presence_penalty": payload.presence_penalty,
        "stream": stream,
    }
    if payload.max_tokens is not None:
        body["max_tokens"] = payload.max_tokens
    return body


def _estimate_cost(
    prompt_tokens: int,
    completion_tokens: int,
    provider: str,
    model: str,
) -> float:
    """Estimate USD cost from the MODEL_CATALOG cost-per-1K table."""
    cost_per_1k = MODEL_CATALOG.get(provider, {}).get(model, 0.005)
    return round((prompt_tokens + completion_tokens) / 1000.0 * cost_per_1k, 8)


# ── Background: wallet deduction + prompt log ───────────


async def _persist_usage(
    user_id: str | None,
    original_prompt: str,
    optimized_prompt: str,
    original_tokens: int,
    optimized_tokens: int,
    completion_tokens: int,
    model_requested: str,
    model_used: str,
    provider: str,
    compression_ratio: float,
    source_tool: str,
) -> None:
    """
    Background task that runs **after** the response stream has finished.

    1. Atomically increments ``used_today_tokens`` and ``total_tokens_all_time``
       on the user's ``TokenWallet``.
    2. Inserts a ``PromptLog`` audit row.
    3. Broadcasts the updated wallet state via WebSocketService.

    Uses its own session so it is fully independent of the request lifecycle.
    """
    total_tokens_used = optimized_tokens + completion_tokens
    estimated_cost = _estimate_cost(optimized_tokens, completion_tokens, provider, model_used)

    async with async_session_factory() as session:
        try:
            user_uuid = None
            if user_id:
                try:
                    user_uuid = uuid.UUID(user_id)
                except ValueError:
                    user_uuid = None

            # ── 1. Atomic wallet update ──────────────────
            if user_uuid is not None:
                stmt = (
                    update(TokenWallet)
                    .where(TokenWallet.user_id == user_uuid)
                    .values(
                        used_today_tokens=TokenWallet.used_today_tokens + total_tokens_used,
                        total_tokens_all_time=TokenWallet.total_tokens_all_time + total_tokens_used,
                    )
                )
                await session.execute(stmt)

            # ── 2. Insert prompt log ─────────────────────
            log_entry = PromptLog(
                user_id=user_uuid,
                original_prompt=original_prompt,
                optimized_prompt=optimized_prompt,
                original_tokens=original_tokens,
                optimized_tokens=optimized_tokens,
                completion_tokens=completion_tokens,
                model_requested=model_requested,
                model_used=model_used,
                source_tool=source_tool,
                compression_ratio=compression_ratio,
                estimated_cost_usd=estimated_cost,
            )
            session.add(log_entry)
            await session.flush()

            # ── 3. Run Leak Diagnostics ──────────────────
            from app.services.leak_detector import check_leak_alerts
            await check_leak_alerts(session, user_id, original_tokens)

            await session.commit()

            logger.info(
                "Persisted usage: user=%s model=%s prompt=%d completion=%d cost=$%.6f",
                user_id,
                model_used,
                optimized_tokens,
                completion_tokens,
                estimated_cost,
            )

            # ── 3. WebSocket Real-time Broadcast ──────────
            if user_uuid is not None:
                from sqlalchemy import select
                from app.routes.ws import ws_service
                
                # Fetch fresh balance from DB
                stmt_select = select(TokenWallet).where(TokenWallet.user_id == user_uuid)
                result = await session.execute(stmt_select)
                wallet = result.scalar_one_or_none()
                if wallet:
                    ws_payload = {
                        "userId": user_id,
                        "balanceTokens": max(wallet.daily_limit_tokens - wallet.used_today_tokens, 0),
                        "usedTokens": wallet.used_today_tokens,
                        "monthlyBudget": wallet.daily_limit_tokens,
                    }
                    await ws_service.send_personal(user_id, ws_payload)

        except Exception:
            await session.rollback()
            logger.exception("Failed to persist usage data")


# ── SSE stream generator ────────────────────────────────


async def _stream_upstream(
    provider: str,
    upstream_url: str,
    headers: dict[str, str],
    body: dict[str, Any],
    request_id: str,
    created_ts: int,
    model_used: str,
) -> AsyncGenerator[tuple[str, str], None]:
    """
    Open a streaming connection to the upstream provider and yield each
    SSE line as-is.  Also accumulates the total completion text so
    the caller can count ``completion_tokens`` after the stream ends.

    Yields ``(sse_line, accumulated_text)`` tuples.
    """
    accumulated_text = ""

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        async with client.stream(
            "POST",
            upstream_url,
            headers=headers,
            json=body,
        ) as response:
            if response.status_code != 200:
                error_body = await response.aread()
                error_text = error_body.decode("utf-8", errors="replace")
                logger.error(
                    "Upstream %s returned %d: %s",
                    provider,
                    response.status_code,
                    error_text[:500],
                )
                # Emit a single error chunk to the client
                error_chunk = {
                    "id": request_id,
                    "object": "chat.completion.chunk",
                    "created": created_ts,
                    "model": model_used,
                    "choices": [
                        {
                            "index": 0,
                            "delta": {
                                "content": f"[CostOps Error] Upstream returned {response.status_code}",
                            },
                            "finish_reason": "stop",
                        }
                    ],
                }
                yield f"data: {json.dumps(error_chunk)}\n\n", ""
                yield "data: [DONE]\n\n", ""
                return

            # ── Stream SSE lines ─────────────────────────
            async for raw_line in response.aiter_lines():
                line = raw_line.strip()
                if not line:
                    continue

                # Pass SSE lines through to the caller
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        yield "data: [DONE]\n\n", accumulated_text
                        return

                    try:
                        chunk = json.loads(data_str)
                        # Extract delta content for char accumulation
                        choices = chunk.get("choices", [])
                        for choice in choices:
                            delta = choice.get("delta", {})
                            content_piece = delta.get("content", "")
                            if content_piece:
                                accumulated_text += content_piece
                    except json.JSONDecodeError:
                        pass

                    yield f"data: {data_str}\n\n", accumulated_text

    # Safety: always end with [DONE]
    yield "data: [DONE]\n\n", accumulated_text


# ── Endpoint ─────────────────────────────────────────────


@router.post("/chat/completions")
async def chat_completions(
    payload: ChatCompletionRequest,
    request: Request,
    background_tasks: BackgroundTasks,
) -> StreamingResponse | JSONResponse:
    """
    OpenAI-compatible ``POST /v1/chat/completions``.

    Supports both ``stream: true`` (SSE) and ``stream: false`` (full JSON).

    Flow
    ----
    1. Extract the last user message from ``messages``.
    2. Run it through the ``PromptOptimizationEngine``.
    3. Build the optimised message list and forward to the upstream provider.
    4a. **Streaming** – relay SSE chunks in real time; schedule a background
        task to persist usage after the stream completes.
    4b. **Non-streaming** – await the full upstream response and return it
        with enriched usage metadata.
    """
    request_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    created_ts = int(time.time())

    # ── 1. Extract user prompt ───────────────────────────
    user_text = _extract_last_user_message(payload.messages)
    original_tokens = _counter.count(user_text)

    # Resolve user identity (injected by AuthMiddleware)
    user_id: str | None = getattr(request.state, "user_id", None) or payload.user or "00000000-0000-0000-0000-000000000000"
    source_tool: str = request.headers.get("X-Source-Tool", "api")

    # ── 2. Optimise ──────────────────────────────────────
    result = await _engine.optimize(
        text=user_text,
        model_hint=payload.model,
    )
    optimized_tokens = _counter.count(result.optimized_text)

    logger.info(
        "Pipeline: %d→%d tokens (%.1f%% saved) → %s/%s",
        original_tokens,
        optimized_tokens,
        result.compression_ratio * 100,
        result.selected_provider,
        result.selected_model,
    )

    # ── 3. Build upstream payload ────────────────────────
    # Replace the last user message with the optimised text while keeping
    # the rest of the conversation history intact.
    optimized_messages: list[dict[str, str]] = []
    last_user_replaced = False
    for msg in reversed(payload.messages):
        if msg.role == "user" and not last_user_replaced:
            optimized_messages.insert(0, {"role": "user", "content": result.optimized_text})
            last_user_replaced = True
        else:
            optimized_messages.insert(0, {"role": msg.role, "content": msg.content})

    provider = result.selected_provider
    model_used = result.selected_model
    upstream_url = _build_upstream_url(provider)
    headers = _build_provider_headers(provider)
    body = _build_upstream_payload(
        payload, optimized_messages, model_used, stream=payload.stream,
    )

    # ── 4a. Streaming mode ───────────────────────────────
    if payload.stream:
        async def _sse_generator() -> AsyncGenerator[str, None]:
            """Relay upstream SSE chunks and persist usage when done."""
            final_text = ""
            async for sse_line, comp_text in _stream_upstream(
                provider=provider,
                upstream_url=upstream_url,
                headers=headers,
                body=body,
                request_id=request_id,
                created_ts=created_ts,
                model_used=model_used,
            ):
                final_text = comp_text
                yield sse_line

            # ── Post-stream persistence ──────────────────
            # Calculate actual completion tokens using TokenCounter.
            est_completion_tokens = _counter.count(final_text) if final_text else 0

            await _persist_usage(
                user_id=user_id,
                original_prompt=user_text,
                optimized_prompt=result.optimized_text,
                original_tokens=original_tokens,
                optimized_tokens=optimized_tokens,
                completion_tokens=est_completion_tokens,
                model_requested=payload.model,
                model_used=model_used,
                provider=provider,
                compression_ratio=result.compression_ratio,
                source_tool=source_tool,
            )

        return StreamingResponse(
            _sse_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-CostOps-Request-Id": request_id,
                "X-CostOps-Tokens-Saved": str(original_tokens - optimized_tokens),
            },
        )

    # ── 4b. Non-streaming mode ───────────────────────────
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        upstream_resp = await client.post(
            upstream_url,
            headers=headers,
            json=body,
        )

    if upstream_resp.status_code != 200:
        logger.error(
            "Upstream %s returned %d: %s",
            provider,
            upstream_resp.status_code,
            upstream_resp.text[:500],
        )
        return JSONResponse(
            status_code=upstream_resp.status_code,
            content={
                "error": {
                    "message": f"Upstream provider error: {upstream_resp.status_code}",
                    "type": "upstream_error",
                    "code": upstream_resp.status_code,
                }
            },
        )

    upstream_data = upstream_resp.json()

    # Extract completion tokens from the upstream response
    upstream_usage = upstream_data.get("usage", {})
    completion_tokens = upstream_usage.get("completion_tokens", 0)

    # Schedule background persistence
    background_tasks.add_task(
        _persist_usage,
        user_id=user_id,
        original_prompt=user_text,
        optimized_prompt=result.optimized_text,
        original_tokens=original_tokens,
        optimized_tokens=optimized_tokens,
        completion_tokens=completion_tokens,
        model_requested=payload.model,
        model_used=model_used,
        provider=provider,
        compression_ratio=result.compression_ratio,
        source_tool=source_tool,
    )

    # Enrich the upstream response with CostOps metadata
    upstream_data["id"] = request_id
    upstream_data["system_fingerprint"] = "costops-v0.2"
    if "usage" in upstream_data:
        upstream_data["usage"]["prompt_tokens_before_optimization"] = original_tokens
        upstream_data["usage"]["tokens_saved"] = original_tokens - optimized_tokens
        upstream_data["usage"]["compression_ratio"] = result.compression_ratio

    return JSONResponse(content=upstream_data)
