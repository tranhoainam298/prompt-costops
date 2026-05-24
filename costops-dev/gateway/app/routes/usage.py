"""
costops-dev — Usage Analytics Route.

Retrieves real database aggregated analytics summaries, daily metrics,
and detailed prompt audit history logs directly from PostgreSQL.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from app.models.models import PromptLog

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/usage", tags=["usage"])


class UsageSummary(BaseModel):
    """Aggregated usage statistics schema."""
    total_requests: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens: int = 0
    total_tokens_saved: int = 0
    average_compression_ratio: float = 0.0
    estimated_cost_usd: float = 0.0
    period_start: str = ""
    period_end: str = ""


class DailyUsageItem(BaseModel):
    """Daily aggregated point schema."""
    date: str
    requests: int
    promptTokens: int
    completionTokens: int
    tokensSaved: int
    costUsd: float


class HistoryLogItem(BaseModel):
    """Prompt log historical audit schema."""
    id: str
    createdAt: str
    modelRequested: str
    modelUsed: str
    originalTokens: int
    optimizedTokens: int
    compressionRatio: float
    estimatedCostUsd: float
    originalPrompt: str
    optimizedPrompt: str


@router.get("/summary", response_model=UsageSummary)
async def get_usage_summary(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> UsageSummary:
    """Return real aggregated usage statistics for the current billing period."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        now = datetime.now(timezone.utc).isoformat()
        return UsageSummary(period_start=now, period_end=now)

    stmt = (
        select(
            func.count(PromptLog.id).label("requests"),
            func.sum(PromptLog.original_tokens).label("original_tokens"),
            func.sum(PromptLog.optimized_tokens).label("optimized_tokens"),
            func.sum(PromptLog.completion_tokens).label("completion_tokens"),
            func.avg(PromptLog.compression_ratio).label("avg_compression"),
            func.sum(PromptLog.estimated_cost_usd).label("cost"),
            func.min(PromptLog.created_at).label("period_start"),
            func.max(PromptLog.created_at).label("period_end"),
        )
        .where(PromptLog.user_id == user_uuid)
    )
    res = await db.execute(stmt)
    row = res.fetchone()

    if not row or row.requests == 0:
        now = datetime.now(timezone.utc).isoformat()
        return UsageSummary(period_start=now, period_end=now)

    original = row.original_tokens or 0
    optimized = row.optimized_tokens or 0
    completion = row.completion_tokens or 0
    saved = max(original - optimized, 0)

    return UsageSummary(
        total_requests=row.requests or 0,
        total_prompt_tokens=original,
        total_completion_tokens=completion,
        total_tokens=optimized + completion,
        total_tokens_saved=saved,
        average_compression_ratio=float(row.avg_compression or 0.0),
        estimated_cost_usd=float(row.cost or 0.0),
        period_start=row.period_start.isoformat() if row.period_start else "",
        period_end=row.period_end.isoformat() if row.period_end else "",
    )


@router.get("/daily", response_model=list[DailyUsageItem])
async def get_daily_usage(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> list[DailyUsageItem]:
    """Return daily usage breakdown from real database prompt logs."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        return []

    stmt = (
        select(
            cast(PromptLog.created_at, Date).label("date"),
            func.count(PromptLog.id).label("requests"),
            func.sum(PromptLog.original_tokens).label("prompt_tokens"),
            func.sum(PromptLog.completion_tokens).label("completion_tokens"),
            func.sum(PromptLog.original_tokens - PromptLog.optimized_tokens).label("tokens_saved"),
            func.sum(PromptLog.estimated_cost_usd).label("cost_usd"),
        )
        .where(PromptLog.user_id == user_uuid)
        .group_by(cast(PromptLog.created_at, Date))
        .order_by(cast(PromptLog.created_at, Date).asc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    return [
        DailyUsageItem(
            date=row.date.isoformat(),
            requests=row.requests or 0,
            promptTokens=row.prompt_tokens or 0,
            completionTokens=row.completion_tokens or 0,
            tokensSaved=row.tokens_saved or 0,
            costUsd=float(row.cost_usd or 0.0),
        )
        for row in rows
    ]


@router.get("/history", response_model=list[HistoryLogItem])
async def get_history_logs(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> list[HistoryLogItem]:
    """Return detailed historical prompt audit records from PostgreSQL."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        return []

    stmt = (
        select(PromptLog)
        .where(PromptLog.user_id == user_uuid)
        .order_by(PromptLog.created_at.desc())
    )
    res = await db.execute(stmt)
    logs = res.scalars().all()

    return [
        HistoryLogItem(
            id=str(log.id),
            createdAt=log.created_at.isoformat(),
            modelRequested=log.model_requested,
            modelUsed=log.model_used,
            originalTokens=log.original_tokens,
            optimizedTokens=log.optimized_tokens,
            compressionRatio=log.compression_ratio,
            estimatedCostUsd=log.estimated_cost_usd,
            originalPrompt=log.original_prompt,
            optimizedPrompt=log.optimized_prompt,
        )
        for log in logs
    ]
