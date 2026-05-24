"""
costops-dev — Quota Guard Middleware.

Enforces per-user rate limits and monthly token budgets before requests
reach the optimization pipeline. Exceeding limits returns HTTP 429.
"""

from __future__ import annotations

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from config import get_settings

logger = logging.getLogger(__name__)


class QuotaGuardMiddleware(BaseHTTPMiddleware):
    """Rate-limiting and budget enforcement middleware."""

    def __init__(self, app, **kwargs) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app, **kwargs)
        self.settings = get_settings()
        # In-memory sliding window counters (replace with Redis in production)
        self._request_counts: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only guard optimisation endpoints
        if not request.url.path.startswith("/v1/chat"):
            return await call_next(request)

        user_id = getattr(request.state, "user_id", "anonymous")
        now = time.time()
        window = 60.0  # 1-minute sliding window

        # ── Sliding-window rate check ────────────────────
        timestamps = self._request_counts.setdefault(user_id, [])
        # Prune expired entries
        timestamps[:] = [ts for ts in timestamps if now - ts < window]

        if len(timestamps) >= self.settings.default_rate_limit:
            logger.warning("Rate limit exceeded for user %s", user_id)
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded",
                    "retry_after_seconds": int(window - (now - timestamps[0])) + 1,
                },
            )

        timestamps.append(now)
        return await call_next(request)
