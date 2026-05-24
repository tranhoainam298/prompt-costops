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
    """Manages active WebSocket connections and broadcasts events, mapped by user_id."""

    def __init__(self) -> None:
        self._connections: dict[str, list[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(websocket)
        logger.info("WebSocket connected: user=%s (total connections for user: %d)", user_id, len(self._connections[user_id]))

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        """Remove a WebSocket connection."""
        if user_id in self._connections:
            if websocket in self._connections[user_id]:
                self._connections[user_id].remove(websocket)
            if not self._connections[user_id]:
                self._connections.pop(user_id)
        logger.info("WebSocket disconnected: user=%s", user_id)

    async def send_personal(self, user_id: str, data: dict[str, Any]) -> None:
        """Send a message to all active WebSocket connections for a user."""
        connections = self._connections.get(user_id, [])
        if not connections:
            return
        
        payload = json.dumps(data, default=str)
        disconnected: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append(ws)
                
        for ws in disconnected:
            try:
                await self.disconnect(user_id, ws)
            except Exception:
                pass

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Broadcast a message to all connected clients."""
        payload = json.dumps(data, default=str)
        disconnected_users: list[tuple[str, WebSocket]] = []
        for user_id, connections in list(self._connections.items()):
            for ws in connections:
                try:
                    await ws.send_text(payload)
                except Exception:
                    disconnected_users.append((user_id, ws))
                    
        for user_id, ws in disconnected_users:
            try:
                await self.disconnect(user_id, ws)
            except Exception:
                pass

    @property
    def active_connections(self) -> int:
        """Return the number of active connections."""
        return sum(len(conns) for conns in self._connections.values())
