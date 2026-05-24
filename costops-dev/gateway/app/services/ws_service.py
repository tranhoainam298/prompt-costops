"""
costops-dev — WebSocket Service.

Manages WebSocket connections for real-time streaming of optimization
metrics and token usage updates to connected clients.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class WebSocketService:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self._connections[client_id] = websocket
        logger.info("WebSocket connected: %s (total: %d)", client_id, len(self._connections))

    async def disconnect(self, client_id: str) -> None:
        """Remove a WebSocket connection."""
        self._connections.pop(client_id, None)
        logger.info("WebSocket disconnected: %s (total: %d)", client_id, len(self._connections))

    async def send_personal(self, client_id: str, data: dict[str, Any]) -> None:
        """Send a message to a specific client."""
        ws = self._connections.get(client_id)
        if ws:
            await ws.send_text(json.dumps(data, default=str))

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Broadcast a message to all connected clients."""
        payload = json.dumps(data, default=str)
        disconnected: list[str] = []
        for client_id, ws in self._connections.items():
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(client_id)
        for cid in disconnected:
            self._connections.pop(cid, None)

    @property
    def active_connections(self) -> int:
        """Return the number of active connections."""
        return len(self._connections)
