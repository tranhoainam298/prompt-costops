"""
costops-dev — Authentication Middleware.

Validates JWT bearer tokens on protected routes and injects user identity
into the request state. Health and docs endpoints are exempt.
"""

from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from jose import JWTError, jwt

from config import get_settings

import hashlib
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from database import async_session_factory
from app.models.models import ApiKey, User, UserRole

logger = logging.getLogger(__name__)

# Paths that do not require authentication
_PUBLIC_PATHS: set[str] = {
    "/health",
    "/v1/docs",
    "/v1/openapi.json",
    "/docs",
    "/openapi.json",
}


class AuthMiddleware(BaseHTTPMiddleware):
    """Starlette middleware that enforces JWT and API Key authentication."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip auth for public endpoints
        if request.url.path in _PUBLIC_PATHS or request.url.path.startswith("/ws/") or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        api_key_header = request.headers.get("x-api-key", "")
        
        token = ""
        if auth_header.startswith("Bearer "):
            token = auth_header.removeprefix("Bearer ").strip()
        elif api_key_header:
            token = api_key_header.strip()

        if token in ("undefined", "null", ""):
            token = ""

        # ── 1. API Key Authentication ───────────────────────
        if token.startswith("costops_key_"):
            key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
            async with async_session_factory() as session:
                stmt = (
                    select(ApiKey)
                    .options(selectinload(ApiKey.user))
                    .where(ApiKey.key_hash == key_hash, ApiKey.is_active == True)
                )
                result = await session.execute(stmt)
                api_key = result.scalar_one_or_none()
                
            if not api_key:
                logger.warning("Invalid or inactive API Key hash used: %s", key_hash[:10])
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or inactive API key"},
                )

            request.state.user_id = str(api_key.user_id)
            request.state.email = api_key.user.email
            request.state.is_admin = api_key.user.role == UserRole.admin
            logger.info("API Key authenticated successfully: user_id=%s, email=%s", request.state.user_id, request.state.email)
            return await call_next(request)

        # ── 2. Standard JWT Authentication ──────────────────
        if not token:
            settings = get_settings()
            if settings.environment == "development":
                request.state.user_id = "00000000-0000-0000-0000-000000000000"
                request.state.email = "dev@costops.local"
                request.state.is_admin = True
                return await call_next(request)

            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"},
            )

        settings = get_settings()

        try:
            payload = jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[settings.jwt_algorithm],
            )
            request.state.user_id = payload.get("sub", "")
            request.state.email = payload.get("email", "")
            request.state.is_admin = payload.get("is_admin", False)
        except JWTError as exc:
            logger.warning("JWT validation failed: %s", exc)
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token"},
            )

        return await call_next(request)
