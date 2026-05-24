"""
costops-dev — Cache Service.

Provides a Redis-backed caching layer for prompt optimization results
and frequently used completions.
"""

from __future__ import annotations

import json
import hashlib
import logging
from typing import Any

import redis.asyncio as aioredis

from config import get_settings

logger = logging.getLogger(__name__)


class CacheService:
    """Redis-backed cache for prompt optimization and completion results."""

    DEFAULT_TTL_SECONDS: int = 3600  # 1 hour

    def __init__(self) -> None:
        settings = get_settings()
        self._redis: aioredis.Redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )

    @staticmethod
    def _make_key(namespace: str, text: str) -> str:
        """Generate a deterministic cache key from namespace + content hash."""
        digest = hashlib.sha256(text.encode()).hexdigest()[:16]
        return f"costops:{namespace}:{digest}"

    async def get(self, namespace: str, text: str) -> Any | None:
        """Retrieve a cached value, or ``None`` on miss."""
        key = self._make_key(namespace, text)
        raw = await self._redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)

    async def set(
        self, namespace: str, text: str, value: Any, ttl: int | None = None
    ) -> None:
        """Store a value in the cache with an optional TTL."""
        key = self._make_key(namespace, text)
        await self._redis.set(
            key,
            json.dumps(value, default=str),
            ex=ttl or self.DEFAULT_TTL_SECONDS,
        )

    async def invalidate(self, namespace: str, text: str) -> None:
        """Remove a specific cache entry."""
        key = self._make_key(namespace, text)
        await self._redis.delete(key)

    async def close(self) -> None:
        """Close the Redis connection."""
        await self._redis.aclose()
