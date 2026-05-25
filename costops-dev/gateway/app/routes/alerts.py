"""
costops-dev — Diagnostics Alerts Route.

Endpoints to retrieve active unread warnings and acknowledge anomalies inside the database.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from app.models.models import CostAlert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/alerts", tags=["alerts"])


class AlertItem(BaseModel):
    """Warning Alert JSON schema."""
    id: str
    user_id: str
    alert_type: str
    message: str
    is_read: bool
    created_at: str


@router.get("")
async def get_active_alerts(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Retrieve all unread diagnostic anomalies from the database."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        logger.warning(f"Invalid user_id uuid format: {user_id}")
        return {"alerts": [], "status": "ok"}

    try:
        stmt = (
            select(CostAlert)
            .where(CostAlert.user_id == user_uuid)
            .where(CostAlert.is_read == False)
            .order_by(CostAlert.created_at.desc())
        )
        result = await db.execute(stmt)
        alerts = result.scalars().all()

        return [
            AlertItem(
                id=str(alert.id),
                user_id=str(alert.user_id),
                alert_type=str(alert.alert_type.value),
                message=alert.message,
                is_read=alert.is_read,
                created_at=alert.created_at.isoformat(),
            )
            for alert in alerts
        ]
    except Exception as e:
        logger.error(f"Failed to fetch active alerts from database: {str(e)}", exc_info=True)
        return {"alerts": [], "status": "ok"}


@router.post("/{alert_id}/read")
async def acknowledge_alert(
    alert_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Mark a warning alert anomaly as read/acknowledged in the database."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    try:
        alert_uuid = uuid.UUID(alert_id)
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid identifier format")

    # Perform atomic read update
    stmt = (
        update(CostAlert)
        .where(CostAlert.id == alert_uuid)
        .where(CostAlert.user_id == user_uuid)
        .values(is_read=True)
    )
    res = await db.execute(stmt)
    await db.commit()

    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Alert not found or access denied")

    return {"status": "success", "message": "Alert acknowledged successfully"}
