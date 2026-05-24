"""
costops-dev — Usage Analytics Route.

Exposes token usage and cost analytics endpoints.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/usage", tags=["usage"])


class UsageSummary(BaseModel):
    """Aggregated usage statistics."""
    total_requests: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    total_tokens: int = 0
    total_tokens_saved: int = 0
    average_compression_ratio: float = 0.0
    estimated_cost_usd: float = 0.0
    period_start: str = ""
    period_end: str = ""


@router.get("/summary", response_model=UsageSummary)
async def get_usage_summary() -> UsageSummary:
    """Return aggregated usage statistics for the current billing period."""
    now = datetime.now(timezone.utc).isoformat()
    return UsageSummary(
        total_requests=0,
        total_prompt_tokens=0,
        total_completion_tokens=0,
        total_tokens=0,
        total_tokens_saved=0,
        average_compression_ratio=0.0,
        estimated_cost_usd=0.0,
        period_start=now,
        period_end=now,
    )


@router.get("/daily")
async def get_daily_usage() -> dict[str, Any]:
    """Return daily usage breakdown."""
    return {"data": [], "period": "daily"}
