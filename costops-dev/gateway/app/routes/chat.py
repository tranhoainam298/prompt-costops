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
import asyncio
import uuid
import logging
from typing import Any, AsyncGenerator

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import async_session_factory, get_db
from app.models.models import PromptLog, TokenWallet, ChatSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.pipeline.engine import PromptOptimizationEngine
from app.pipeline.router import MODEL_CATALOG
from app.services.token_counter import TokenCounter
from app.services.precrime import precrime_service

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/v1", tags=["chat"])

# ── Endpoints: Chat History ─────────────────────────────

@router.get("/chat/conversations")
async def get_conversations(request: Request):
    """Return all chat sessions for the active user."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    async with async_session_factory() as session:
        stmt = (
            select(ChatSession)
            .where(ChatSession.user_id == user_uuid)
            .order_by(ChatSession.updated_at.desc())
        )
        result = await session.execute(stmt)
        sessions = result.scalars().all()
        return [
            {
                "id": str(s.id),
                "title": s.title,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
            }
            for s in sessions
        ]


@router.get("/chat/conversations/{session_id}")
async def get_conversation_details(session_id: str, request: Request):
    """Return prompt logs for a specific session."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    try:
        user_uuid = uuid.UUID(user_id)
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format")

    async with async_session_factory() as session:
        stmt = (
            select(ChatSession)
            .options(selectinload(ChatSession.prompt_logs))
            .where(ChatSession.id == sess_uuid, ChatSession.user_id == user_uuid)
        )
        result = await session.execute(stmt)
        chat_session = result.scalar_one_or_none()
        if not chat_session:
            raise HTTPException(status_code=404, detail="Chat session not found")

        # Sort logs by created_at
        logs = sorted(chat_session.prompt_logs, key=lambda x: x.created_at)
        return {
            "id": str(chat_session.id),
            "title": chat_session.title,
            "created_at": chat_session.created_at.isoformat(),
            "messages": [
                {
                    "id": str(l.id),
                    "original_prompt": l.original_prompt,
                    "model_used": l.model_used,
                    "created_at": l.created_at.isoformat(),
                    "completion_tokens": l.completion_tokens,
                }
                for l in logs
            ]
        }

# ── Singletons ───────────────────────────────────────────

_engine = PromptOptimizationEngine()
_counter = TokenCounter(model="gpt-4o")

# ── Provider endpoint / key mapping ─────────────────────

_PROVIDER_CONFIG: dict[str, dict[str, str]] = {
    "openai": {
        "base_url": settings.openrouter_base_url,
        "key_attr": "openrouter_api_key",
    },
    "deepseek": {
        "base_url": settings.openrouter_base_url,
        "key_attr": "openrouter_api_key",
    },
    "anthropic": {
        "base_url": settings.openrouter_base_url,
        "key_attr": "openrouter_api_key",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "key_attr": "gemini_api_key",
    },
    "openrouter": {
        "base_url": settings.openrouter_base_url,
        "key_attr": "openrouter_api_key",
    },
    "opencode": {
        "base_url": settings.opencode_base_url,
        "key_attr": "opencode_api_key",
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
    presence_penalty: float = Field(default=0.0, ge=-2.0, le=2.0)
    stream: bool = False
    user: str | None = None
    session_id: str | None = None


class UsageInfo(BaseModel):
    """Token usage statistics returned in non-streaming responses."""
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    prompt_tokens_before_optimization: int = 0
    tokens_saved: int = 0
    compression_ratio: float = 0.0


class PromptOptimizeRequest(BaseModel):
    raw_prompt: str


class OptimizeResponse(BaseModel):
    optimized_prompt: str
    original_tokens: int
    optimized_tokens: int
    savings_percentage: float


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
    """Return the HTTP headers required by *provider*.

    Raises ``HTTPException(400)`` if the API key for the resolved
    provider is empty, whitespace-only, or still contains a known
    placeholder string — preventing malformed ``Authorization`` headers.
    """
    cfg = _PROVIDER_CONFIG.get(provider, _PROVIDER_CONFIG["openai"])
    raw_key: str = getattr(settings, cfg["key_attr"], "") or ""
    api_key = raw_key.strip()

    # ── Placeholder patterns that indicate an unconfigured key ──
    _PLACEHOLDER_FRAGMENTS = (
        "your_", "your-", "sk-your", "sk-ant-your",
        "api_key_here", "api-key-here", "changeme",
    )
    is_placeholder = any(frag in api_key.lower() for frag in _PLACEHOLDER_FRAGMENTS)

    if not api_key or is_placeholder:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Configuration Error: API Key for provider '{provider}' "
                f"(env var: {cfg['key_attr'].upper()}) is missing or "
                f"unconfigured in your gateway .env file."
            ),
        )

    if provider == "anthropic":
        return {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
    if provider == "openrouter":
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://costops.dev",
            "X-Title": "CostOps Gateway",
        }
    if provider == "opencode":
        return {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://costops.dev",
            "X-Title": "CostOps Gateway",
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
    provider: str = "",
    stream: bool,
) -> dict[str, Any]:
    """Assemble the JSON body sent to the upstream provider."""
    # Map model names to OpenRouter equivalents
    model_mapping = {
        "gpt-4o": "openai/gpt-4o",
        "gpt-4o-mini": "openai/gpt-4o-mini",
        "gpt-4-turbo": "openai/gpt-4-turbo",
        "claude-sonnet-4-20250514": "anthropic/claude-3.5-sonnet",
        "claude-3-haiku-20240307": "anthropic/claude-3-haiku",
        "deepseek-chat": "deepseek/deepseek-chat",
        "deepseek-coder": "deepseek/deepseek-coder",
        "gemini-2.5-flash": "google/gemini-2.5-flash",
        "minimax-m3-free": "minimax-m3-free",
    }
    mapped_model = model_mapping.get(model_used, model_used)
    if provider == "gemini" and mapped_model.startswith("google/"):
        mapped_model = mapped_model.replace("google/", "")

    body: dict[str, Any] = {
        "model": mapped_model,
        "messages": optimized_messages,
        "temperature": payload.temperature,
        "top_p": payload.top_p,
        "stream": stream,
    }
    if provider != "gemini":
        body["frequency_penalty"] = payload.frequency_penalty
        body["presence_penalty"] = payload.presence_penalty
    if payload.max_tokens is not None:
        body["max_tokens"] = payload.max_tokens
    return body



def _estimate_cost(
    prompt_tokens: int,
    completion_tokens: int,
    provider: str,
    model: str,
) -> float:
    """Estimate USD cost from the MODEL_CATALOG cost-per-1K table.

    For Gemini models, use exact per-token input/output pricing:
      - gemini-2.5-flash input:  $0.30 / 1M tokens  ($0.0000003 / token)
      - gemini-2.5-flash output: $2.50 / 1M tokens  ($0.0000025 / token)
    """
    # ── Gemini-specific granular pricing ──────────────────
    _GEMINI_PRICING: dict[str, dict[str, float]] = {
        "gemini-2.5-flash": {
            "input_per_token": 0.0000003,   # $0.30 / 1M tokens
            "output_per_token": 0.0000025,  # $2.50 / 1M tokens
        },
    }

    if provider == "gemini" and model in _GEMINI_PRICING:
        rates = _GEMINI_PRICING[model]
        input_cost = prompt_tokens * rates["input_per_token"]
        output_cost = completion_tokens * rates["output_per_token"]
        return round(input_cost + output_cost, 8)

    # ── Default blended cost-per-1K for all other providers
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
    session_id: str | None = None,
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
            membership = None
            team = None
            if user_uuid is not None:
                # First update the member's wallet
                stmt = (
                    update(TokenWallet)
                    .where(TokenWallet.user_id == user_uuid)
                    .values(
                        used_today_tokens=TokenWallet.used_today_tokens + total_tokens_used,
                        total_tokens_all_time=TokenWallet.total_tokens_all_time + total_tokens_used,
                    )
                )
                await session.execute(stmt)

                # Fetch team membership and debit team owner if member belongs to a team
                from app.models.models import TeamMember, Team
                stmt_member = select(TeamMember).where(TeamMember.user_id == user_uuid)
                res_member = await session.execute(stmt_member)
                membership = res_member.scalar_one_or_none()
                
                if membership:
                    stmt_team = select(Team).where(Team.id == membership.team_id)
                    res_team = await session.execute(stmt_team)
                    team = res_team.scalar_one_or_none()
                    
                    if team and team.owner_id != user_uuid:
                        stmt_team_wallet = (
                            update(TokenWallet)
                            .where(TokenWallet.user_id == team.owner_id)
                            .values(
                                used_today_tokens=TokenWallet.used_today_tokens + total_tokens_used,
                                total_tokens_all_time=TokenWallet.total_tokens_all_time + total_tokens_used,
                            )
                        )
                        await session.execute(stmt_team_wallet)

            # ── 2. Insert prompt log ─────────────────────
            session_uuid = None
            if session_id:
                try:
                    session_uuid = uuid.UUID(session_id)
                except ValueError:
                    pass

            log_entry = PromptLog(
                user_id=user_uuid,
                session_id=session_uuid,
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

            # ── 4. WebSocket Real-time Broadcast ──────────
            if user_uuid is not None:
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

                # Broadcast team owner's wallet update too if user is a member
                if membership and team and team.owner_id != user_uuid:
                    stmt_owner_select = select(TokenWallet).where(TokenWallet.user_id == team.owner_id)
                    res_owner_select = await session.execute(stmt_owner_select)
                    owner_wallet = res_owner_select.scalar_one_or_none()
                    if owner_wallet:
                        ws_owner_payload = {
                            "userId": str(team.owner_id),
                            "balanceTokens": max(owner_wallet.daily_limit_tokens - owner_wallet.used_today_tokens, 0),
                            "usedTokens": owner_wallet.used_today_tokens,
                            "monthlyBudget": owner_wallet.daily_limit_tokens,
                        }
                        await ws_service.send_personal(str(team.owner_id), ws_owner_payload)

        except Exception:
            await session.rollback()
            logger.exception("Failed to persist usage data")


# ── SSE stream generator ────────────────────────────────


async def _stream_upstream(
    initial_provider: str,
    optimized_messages: list[dict[str, str]],
    payload: ChatCompletionRequest,
    request_id: str,
    created_ts: int,
    initial_model: str,
) -> AsyncGenerator[tuple[str, str, str, str], None]:
    """
    Open a streaming connection to the upstream provider and yield each
    SSE line as-is. Performs automatic retries on 429/5xx and fails over to backup
    free models if all retries fail.

    Yields (sse_line, accumulated_text, final_provider, final_model) tuples.
    """
    import asyncio

    # Establish fallback model sequence
    models_to_try = [(initial_provider, initial_model)]
    if initial_provider == "openrouter":
        free_fallbacks = [
            "google/gemini-2.0-flash-lite-preview-02-05:free",
            "meta-llama/llama-3-8b-instruct:free",
            "google/gemma-2-9b-it:free"
        ]
        for fb_model in free_fallbacks:
            if fb_model != initial_model:
                models_to_try.append(("openrouter", fb_model))
        # Fallback to free OpenCode MiniMax M3
        models_to_try.append(("opencode", "minimax-m3-free"))
        # Ultimate fallback is native Gemini
        models_to_try.append(("gemini", "gemini-2.5-flash"))
    elif initial_provider == "opencode":
        # OpenCode fallback: try OpenRouter free models, then Gemini
        models_to_try.append(("openrouter", "moonshotai/kimi-k2.6:free"))
        models_to_try.append(("gemini", "gemini-2.5-flash"))
    elif initial_provider != "gemini":
        models_to_try.append(("gemini", "gemini-2.5-flash"))

    accumulated_text = ""
    success = False

    for current_provider, current_model in models_to_try:
        if success:
            break

        upstream_url = _build_upstream_url(current_provider)
        headers = _build_provider_headers(current_provider)
        body = _build_upstream_payload(
            payload, optimized_messages, current_model, provider=current_provider, stream=True
        )

        max_retries = 3
        backoff_delay = 1.0

        for attempt in range(1, max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                    async with client.stream(
                        "POST",
                        upstream_url,
                        headers=headers,
                        json=body,
                    ) as response:
                        if response.status_code == 200:
                            async for raw_line in response.aiter_lines():
                                line = raw_line.strip()
                                if not line:
                                    continue

                                # Pass SSE lines through to the caller
                                if line.startswith("data: "):
                                    data_str = line[6:]
                                    if data_str == "[DONE]":
                                        yield "data: [DONE]\n\n", accumulated_text, current_provider, current_model
                                        success = True
                                        return

                                    try:
                                        chunk = json.loads(data_str)
                                        choices = chunk.get("choices", [])
                                        for choice in choices:
                                            delta = choice.get("delta", {})
                                            content_piece = delta.get("content", "")
                                            if content_piece:
                                                accumulated_text += content_piece
                                    except Exception:
                                        pass

                                    yield f"data: {data_str}\n\n", accumulated_text, current_provider, current_model
                            
                            yield "data: [DONE]\n\n", accumulated_text, current_provider, current_model
                            success = True
                            return

                        if response.status_code in (429, 500, 502, 503, 504):
                            logger.warning(
                                "Upstream %s/%s attempt %d returned status %d. Retrying...",
                                current_provider, current_model, attempt, response.status_code
                            )
                            raise httpx.HTTPStatusError(
                                f"Status {response.status_code}",
                                request=response.request,
                                response=response
                            )

                        logger.error(
                            "Upstream %s/%s returned non-retryable status %d",
                            current_provider, current_model, response.status_code
                        )
                        break  # Break retry loop to try next fallback model
            except Exception as e:
                logger.error(
                    "Error during connection to %s/%s (attempt %d): %s",
                    current_provider, current_model, attempt, str(e)
                )
                if attempt < max_retries:
                    await asyncio.sleep(backoff_delay)
                    backoff_delay *= 2.0
                else:
                    logger.warning(
                        "All %d retry attempts failed for %s/%s.",
                        max_retries, current_provider, current_model
                    )

    # Gate 3: Clean Exception Formatting
    error_chunk = {
        "error": "Upstream Provider Overloaded",
        "status": "Degraded",
        "message": "All openrouter free endpoints are experiencing high traffic. Please try again shortly."
    }
    yield f"data: {json.dumps(error_chunk)}\n\n", "", "openrouter", "error"


# ── Endpoint ─────────────────────────────────────────────


@router.post("/chat/completions", response_model=None)
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
    user_id_str: str | None = getattr(request.state, "user_id", None) or payload.user or "00000000-0000-0000-0000-000000000000"
    source_tool: str = request.headers.get("X-Source-Tool", "api")
    
    # ── Pre-Crime Loop Interception ──────────────────────
    is_loop = await precrime_service.detect_loop(user_id_str, user_text)
    if is_loop:
        return JSONResponse(
            status_code=429,
            content={
                "error": "Agentic Loop Detected",
                "status": "Terminated",
                "message": "Infinite loop logic intercepted by CostOps Guardrails.",
                "blast_radius_tokens_saved": 4500
            }
        )
    
    # Session handling: Create one if session_id is None
    if not payload.session_id:
        title = " ".join(user_text.split()[:5]) + "..." if user_text else "New Chat"
        try:
            user_uuid = uuid.UUID(user_id_str)
            async with async_session_factory() as session:
                new_session = ChatSession(user_id=user_uuid, title=title)
                session.add(new_session)
                await session.commit()
                payload.session_id = str(new_session.id)
        except ValueError:
            pass # Invalid user_id fallback

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

    # ── System Prompt Injection Middleware ──────────────────
    SYSTEM_PROMPT = (
        "[SYSTEM INSIGHT ENFORCER]\n"
        "You are the CostOps Socratic AI Coach—a premium, high-density Senior DevOps & Cost-Aware Systems Architect. "
        "You are embedded inside a token-optimization proxy platform.\n\n"
        "STRICT OPERATIONAL RULES:\n"
        "1. PERSONALITY: Never say friendly fluff or generic introductory statements (e.g., \"Chào bạn, tôi có thể giúp gì...\"). "
        "Speak directly like a crisp terminal output or a senior technical lead.\n"
        "2. CODE CONCISENESS: When the user asks for code or architecture fixes, strip away all verbose explanations. "
        "Provide the clean, production-ready refactored code immediately using precise Markdown code blocks.\n"
        "3. TOKEN-CONSCIOUSNESS: Every response you generate costs the user money. "
        "Keep your text output dense, highly informative, and minimal. Optimize your own output tokens."
    )

    has_system = False
    for msg in optimized_messages:
        if msg["role"] == "system":
            msg["content"] = f"{SYSTEM_PROMPT}\n\n{msg['content']}"
            has_system = True
            break

    if not has_system:
        optimized_messages.insert(0, {"role": "system", "content": SYSTEM_PROMPT})

    provider = result.selected_provider
    model_used = result.selected_model

    # ── 4a. Streaming mode ───────────────────────────────
    if payload.stream:
        async def _sse_generator() -> AsyncGenerator[str, None]:
            """Relay upstream SSE chunks and persist usage when done."""
            final_text = ""
            final_provider = provider
            final_model = model_used
            async for sse_line, comp_text, current_provider, current_model in _stream_upstream(
                initial_provider=provider,
                optimized_messages=optimized_messages,
                payload=payload,
                request_id=request_id,
                created_ts=created_ts,
                initial_model=model_used,
            ):
                final_text = comp_text
                final_provider = current_provider
                final_model = current_model
                yield sse_line

            # If final_model is "error", then streaming failover completely failed.
            # Do not persist usage since it was an error.
            if final_model == "error":
                return

            # ── Post-stream persistence ──────────────────
            # Calculate actual completion tokens using TokenCounter.
            est_completion_tokens = _counter.count(final_text) if final_text else 0

            await _persist_usage(
                user_id=user_id_str,
                original_prompt=user_text,
                optimized_prompt=result.optimized_text,
                original_tokens=original_tokens,
                optimized_tokens=optimized_tokens,
                completion_tokens=est_completion_tokens,
                model_requested=payload.model,
                model_used=final_model,
                provider=final_provider,
                compression_ratio=result.compression_ratio,
                source_tool=source_tool,
                session_id=payload.session_id,
            )

        headers_sse = {
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-CostOps-Request-Id": request_id,
            "X-CostOps-Tokens-Saved": str(original_tokens - optimized_tokens),
        }
        if payload.session_id:
            headers_sse["X-CostOps-Session-Id"] = payload.session_id

        return StreamingResponse(
            _sse_generator(),
            media_type="text/event-stream",
            headers=headers_sse,
        )

    # ── 4b. Non-streaming mode with Retry & Failover ───────────────────────────
    models_to_try = [(provider, model_used)]
    if provider == "openrouter":
        free_fallbacks = [
            "google/gemini-2.0-flash-lite-preview-02-05:free",
            "meta-llama/llama-3-8b-instruct:free",
            "google/gemma-2-9b-it:free"
        ]
        for fb_model in free_fallbacks:
            if fb_model != model_used:
                models_to_try.append(("openrouter", fb_model))
        # Ultimate fallback is native Gemini
        models_to_try.append(("gemini", "gemini-2.5-flash"))
    elif provider != "gemini":
        models_to_try.append(("gemini", "gemini-2.5-flash"))

    upstream_resp = None
    success = False
    final_provider = provider
    final_model = model_used

    for current_provider, current_model in models_to_try:
        if success:
            break

        upstream_url = _build_upstream_url(current_provider)
        headers = _build_provider_headers(current_provider)
        body = _build_upstream_payload(
            payload, optimized_messages, current_model, provider=current_provider, stream=False
        )

        max_retries = 3
        backoff_delay = 1.0
        final_provider = current_provider
        final_model = current_model

        for attempt in range(1, max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
                    response = await client.post(
                        upstream_url,
                        headers=headers,
                        json=body,
                    )
                    if response.status_code == 200:
                        upstream_resp = response
                        success = True
                        break

                    if response.status_code in (429, 500, 502, 503, 504):
                        logger.warning(
                            "Upstream %s/%s attempt %d returned status %d. Retrying...",
                            current_provider, current_model, attempt, response.status_code
                        )
                        raise httpx.HTTPStatusError(
                            f"Status {response.status_code}",
                            request=response.request,
                            response=response
                        )

                    logger.error(
                        "Upstream %s/%s returned non-retryable status %d",
                        current_provider, current_model, response.status_code
                    )
                    upstream_resp = response
                    break  # Break retry loop to try next fallback model
            except Exception as e:
                logger.error(
                    "Error during connection to %s/%s (attempt %d): %s",
                    current_provider, current_model, attempt, str(e)
                )
                if attempt < max_retries:
                    await asyncio.sleep(backoff_delay)
                    backoff_delay *= 2.0
                else:
                    logger.warning(
                        "All %d retry attempts failed for %s/%s.",
                        max_retries, current_provider, current_model
                    )

    if not success:
        # Gate 3: Clean Exception Formatting
        logger.error("All non-streaming attempts and failovers failed.")
        return JSONResponse(
            status_code=503,
            content={
                "error": "Upstream Provider Overloaded",
                "status": "Degraded",
                "message": "All openrouter free endpoints are experiencing high traffic. Please try again shortly."
            }
        )

    # Make sure we use the successful provider/model for the remaining code
    provider = final_provider
    model_used = final_model

    upstream_data = upstream_resp.json()

    # Extract completion tokens from the upstream response
    upstream_usage = upstream_data.get("usage", {})
    completion_tokens = upstream_usage.get("completion_tokens", 0)

    # Schedule background persistence
    background_tasks.add_task(
        _persist_usage,
        user_id=user_id_str,
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
        session_id=payload.session_id,
    )

    # Enrich the upstream response with CostOps metadata
    upstream_data["id"] = request_id
    upstream_data["system_fingerprint"] = "costops-v0.2"
    if "usage" in upstream_data:
        upstream_data["usage"]["prompt_tokens_before_optimization"] = original_tokens
        upstream_data["usage"]["tokens_saved"] = original_tokens - optimized_tokens
        upstream_data["usage"]["compression_ratio"] = result.compression_ratio

    return JSONResponse(content=upstream_data)


@router.post("/prompt/optimize", response_model=OptimizeResponse)
async def optimize_prompt(payload: PromptOptimizeRequest, request: Request):
    """
    Explicitly run Stage 2 & 3 optimizations without calling upstream APIs.
    """
    print(f"CRITICAL GATEWAY LOG - Received raw_prompt: {payload.raw_prompt}")
    
    raw_prompt = payload.raw_prompt
    user_id_str: str | None = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    # ── Pre-Crime Loop Interception ──────────────────────
    is_loop = await precrime_service.detect_loop(user_id_str, raw_prompt)
    if is_loop:
        return JSONResponse(
            status_code=429,
            content={
                "error": "Agentic Loop Detected",
                "status": "Terminated",
                "message": "Infinite loop logic intercepted by CostOps Guardrails.",
                "blast_radius_tokens_saved": 4500
            }
        )
        
    try:
        original_text_stripped = raw_prompt.strip()
        
        # Run optimization (Stage 2 & 3)
        optimized_text = _engine.optimize_user_prompt(raw_prompt)
        
        # Calculate tokens naturally
        original_tokens = _engine._estimate_tokens(raw_prompt)
        if original_tokens == 0 and len(raw_prompt) > 0:
            original_tokens = max(1, len(raw_prompt) // 4)
            
        optimized_tokens = _engine._estimate_tokens(optimized_text)
        if optimized_tokens == 0 and len(optimized_text) > 0:
            optimized_tokens = max(1, len(optimized_text) // 4)
        
        if original_tokens > 0:
            savings = ((original_tokens - optimized_tokens) / original_tokens) * 100
            savings_percentage = max(0.0, round(savings, 1))
        else:
            savings_percentage = 0.0

        return OptimizeResponse(
            optimized_prompt=optimized_text,
            original_tokens=original_tokens,
            optimized_tokens=optimized_tokens,
            savings_percentage=savings_percentage
        )
    except Exception as e:
        logger.error(f"Internal engine error during optimize: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/prompt/generate", response_model=OptimizeResponse)
async def generate_master_prompt(payload: PromptOptimizeRequest, request: Request):
    """
    Expands a short idea into a highly detailed Master Prompt via Gemini 2.5.
    """
    raw_prompt = payload.raw_prompt
    user_id_str: str | None = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    # ── Pre-Crime Loop Interception ──────────────────────
    is_loop = await precrime_service.detect_loop(user_id_str, raw_prompt)
    if is_loop:
        return JSONResponse(
            status_code=429,
            content={
                "error": "Agentic Loop Detected",
                "status": "Terminated",
                "message": "Infinite loop logic intercepted by CostOps Guardrails.",
                "blast_radius_tokens_saved": 4500
            }
        )
    
    provider = "gemini"
    model_used = "gemini-2.5-flash"
    
    upstream_url = _build_upstream_url(provider)
    try:
        headers = _build_provider_headers(provider)
    except HTTPException:
        # Provide a graceful fallback error
        raise HTTPException(status_code=400, detail="Gemini API Key missing or not configured for Prompt Expansion.")
        
    system_prompt = (
        "You are an Expert Prompt Engineer. Your single task is to convert the user's conversational, informal input (often in Vietnamese with fluff like 'Chào AI', 'giúp tôi với') into a high-density, professional, industry-standard Master Prompt in technical English.\n\n"
        "CRITICAL OUTPUT CONSTRAINTS:\n"
        "1. Do NOT write any application source code (e.g., no python, javascript, sql blocks).\n"
        "2. Do NOT output code blocks or full mock scripts.\n"
        "3. Output ONLY the structured markdown blueprint of the prompt itself using exactly these sections:\n"
        "   ## Master Prompt: [Title]\n"
        "   ### Role\n"
        "   ### Context\n"
        "   ### Task\n"
        "   ### Constraints\n"
        "   ### Expected Output Format\n\n"
        "Ensure the response is clean, direct, and completely free of conversational conversational filler from you. Output the prompt blueprint direct."
    )
    
    body = {
        "model": model_used,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": raw_prompt}
        ],
        "temperature": 0.7,
        "stream": False
    }
    
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        resp = await client.post(upstream_url, headers=headers, json=body)
        
    if resp.status_code != 200:
        logger.error("Generate error: %d - %s", resp.status_code, resp.text)
        generated_prompt = f"⚠️ Generation failed: {resp.status_code}"
    else:
        data = resp.json()
        generated_prompt = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
    generated_length = _engine._estimate_tokens(generated_prompt)
    if generated_length == 0 and len(generated_prompt) > 0:
        generated_length = max(1, len(generated_prompt) // 4)
        
    return OptimizeResponse(
        optimized_prompt=generated_prompt,
        original_tokens=0,
        optimized_tokens=generated_length,
        savings_percentage=0.0
    )
