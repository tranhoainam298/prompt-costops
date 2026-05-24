"""
costops-dev — WebSocket Route.

Endpoints for WebSocket connections to stream real-time wallet quota updates.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError
from sqlalchemy import select

from config import get_settings
from database import async_session_factory
from app.models.models import TokenWallet
from app.services.ws_service import WebSocketService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["websocket"])

# Singleton instance of WebSocketService
ws_service = WebSocketService()


@router.websocket("/ws/quota")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str | None = Query(None)
):
    """
    WebSocket endpoint for real-time wallet quota streaming.
    Accepts handshakes, validates the JWT token from the query parameters,
    and maintains the connection to stream changes.
    """
    user_id_str = None
    if token:
        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
            user_id_str = payload.get("sub", "")
        except JWTError as exc:
            logger.warning("WebSocket JWT validation failed, using dev fallback: %s", exc)

    if not user_id_str:
        # Graceful fallback for development/playground testing
        user_id_str = "00000000-0000-0000-0000-000000000000"
        logger.info("WebSocket connection using dev fallback user_id: %s", user_id_str)

    # Register connection
    await ws_service.connect(user_id_str, websocket)

    try:
        # Stream initial database state of TokenWallet immediately to user
        async with async_session_factory() as session:
            from app.routes.wallet import get_or_create_wallet
            wallet = await get_or_create_wallet(session, user_id_str)
            await session.commit()
            
            if wallet:
                initial_data = {
                    "userId": user_id_str,
                    "balanceTokens": max(wallet.daily_limit_tokens - wallet.used_today_tokens, 0),
                    "usedTokens": wallet.used_today_tokens,
                    "monthlyBudget": wallet.daily_limit_tokens,
                }
                await websocket.send_json(initial_data)

        # Keep connection open and listen for messages or disconnects
        while True:
            # We wait for close/incoming messages
            data = await websocket.receive_text()
            logger.debug("Received WebSocket message from %s: %s", user_id_str, data)

    except WebSocketDisconnect:
        await ws_service.disconnect(user_id_str, websocket)
    except Exception as exc:
        logger.exception("Error in WebSocket connection for user %s: %s", user_id_str, exc)
        await ws_service.disconnect(user_id_str, websocket)
