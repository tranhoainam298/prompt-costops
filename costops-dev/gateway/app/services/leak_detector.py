"""
costops-dev — Token Leak Diagnostics Engine.

Applies logic rules to detect content bloat (payload abuse) and rapid requests looping,
atomically registering diagnostic cost alerts inside the PostgreSQL database.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import CostAlert, PromptLog, AlertType

logger = logging.getLogger(__name__)


async def check_leak_alerts(
    session: AsyncSession,
    user_id_str: str | None,
    original_tokens: int,
) -> None:
    """
    Analyzes prompt logs and user activity to identify potential token leaks or anomalies.
    Runs asynchronously in the post-stream processing pipeline.
    """
    if not user_id_str:
        return

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        return

    now = datetime.now(timezone.utc)

    # ── Rule 1: Content Bloat (Payload Abuse) ───────────────────
    # If a single request has an original_tokens count exceeding 50,000 tokens
    if original_tokens > 50000:
        logger.warning(
            "Token Leak Alert: Content Bloat detected for user %s (%d tokens)",
            user_id_str,
            original_tokens,
        )
        alert = CostAlert(
            user_id=user_uuid,
            alert_type=AlertType.leak,
            message=f"Excessive File Context Upload: Prompt exceeded 50,000 tokens (received {original_tokens:,} tokens).",
            is_read=False,
            created_at=now,
        )
        session.add(alert)
        await session.flush()

    # ── Rule 2: Loop Detection (High Frequency Spike) ───────────
    # If a user triggers > 10 requests within a rolling 60-second window
    one_minute_ago = now - timedelta(seconds=60)

    stmt = (
        select(func.count(PromptLog.id))
        .where(PromptLog.user_id == user_uuid)
        .where(PromptLog.created_at >= one_minute_ago)
    )
    result = await session.execute(stmt)
    request_count = result.scalar() or 0

    if request_count > 10:
        logger.warning(
            "Token Leak Alert: Infinite Loop Loophole detected for user %s (%d requests/min)",
            user_id_str,
            request_count,
        )

        # Anti-spam: check if a loop alert was already fired in the last minute
        check_spam = (
            select(CostAlert)
            .where(CostAlert.user_id == user_uuid)
            .where(CostAlert.alert_type == AlertType.leak)
            .where(CostAlert.message.like("%AI Agent Infinite Loop Loophole%"))
            .where(CostAlert.created_at >= one_minute_ago)
        )
        spam_result = await session.execute(check_spam)
        already_alerted = spam_result.scalar_one_or_none()

        if not already_alerted:
            alert = CostAlert(
                user_id=user_uuid,
                alert_type=AlertType.leak,
                message=f"AI Agent Infinite Loop Loophole: High-frequency request burst detected ({request_count} requests in 60s).",
                is_read=False,
                created_at=now,
            )
            session.add(alert)
            await session.flush()
