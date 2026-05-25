"""
costops-dev — Quota Guard Middleware.

Enforces per-user rate limits and monthly token budgets before requests
reach the optimization pipeline. Exceeding limits returns HTTP 429.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import datetime, timezone, timedelta

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from sqlalchemy.future import select

from config import get_settings
from database import async_session_factory
from app.models.models import TokenWallet, TeamMember, Team

logger = logging.getLogger(__name__)


class QuotaGuardMiddleware(BaseHTTPMiddleware):
    """Rate-limiting and budget enforcement middleware."""

    def __init__(self, app, **kwargs) -> None:  # type: ignore[no-untyped-def]
        super().__init__(app, **kwargs)
        self.settings = get_settings()
        # In-memory sliding window counters (replace with Redis in production)
        self._request_counts: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Only guard completions endpoints
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

        # ── Budget / Quota checks (Isolation Layer) ─────
        if user_id != "anonymous":
            try:
                user_uuid = uuid.UUID(user_id)
            except ValueError:
                user_uuid = None

            if user_uuid:
                async with async_session_factory() as session:
                    # 1. Fetch user's wallet
                    stmt_user_wallet = select(TokenWallet).where(TokenWallet.user_id == user_uuid)
                    res_user_wallet = await session.execute(stmt_user_wallet)
                    user_wallet = res_user_wallet.scalar_one_or_none()
                    
                    now_dt = datetime.now(timezone.utc)
                    if user_wallet and user_wallet.reset_at:
                        reset_at = user_wallet.reset_at
                        if reset_at.tzinfo is None:
                            reset_at = reset_at.replace(tzinfo=timezone.utc)
                        if now_dt > reset_at:
                            user_wallet.used_today_tokens = 0
                            user_wallet.reset_at = now_dt + timedelta(days=30)
                            session.add(user_wallet)
                            await session.commit()

                    if user_wallet:
                        if user_wallet.used_today_tokens >= user_wallet.daily_limit_tokens:
                            logger.warning("User daily limit exceeded: user_id=%s (%d >= %d)", user_id, user_wallet.used_today_tokens, user_wallet.daily_limit_tokens)
                            return JSONResponse(
                                status_code=403,
                                content={"detail": "Member Quota Exceeded"},
                            )

                    # 2. Check Team owner's wallet if user is in a team
                    stmt_member = select(TeamMember).where(TeamMember.user_id == user_uuid)
                    res_member = await session.execute(stmt_member)
                    membership = res_member.scalar_one_or_none()
                    
                    if membership:
                        stmt_team = select(Team).where(Team.id == membership.team_id)
                        res_team = await session.execute(stmt_team)
                        team = res_team.scalar_one_or_none()
                        
                        if team and team.owner_id != user_uuid:
                            stmt_owner_wallet = select(TokenWallet).where(TokenWallet.user_id == team.owner_id)
                            res_owner_wallet = await session.execute(stmt_owner_wallet)
                            owner_wallet = res_owner_wallet.scalar_one_or_none()
                            
                            if owner_wallet:
                                if owner_wallet.reset_at:
                                    owner_reset_at = owner_wallet.reset_at
                                    if owner_reset_at.tzinfo is None:
                                        owner_reset_at = owner_reset_at.replace(tzinfo=timezone.utc)
                                    if now_dt > owner_reset_at:
                                        owner_wallet.used_today_tokens = 0
                                        owner_wallet.reset_at = now_dt + timedelta(days=30)
                                        session.add(owner_wallet)
                                        await session.commit()
                                
                                if owner_wallet.used_today_tokens >= owner_wallet.daily_limit_tokens:
                                    logger.warning("Team owner limit exceeded: owner_id=%s (%d >= %d)", team.owner_id, owner_wallet.used_today_tokens, owner_wallet.daily_limit_tokens)
                                    return JSONResponse(
                                        status_code=403,
                                        content={"detail": "Team Quota Exceeded"},
                                    )

        return await call_next(request)
