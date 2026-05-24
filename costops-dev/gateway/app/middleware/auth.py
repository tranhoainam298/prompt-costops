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
    """Starlette middleware that enforces JWT authentication."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Skip auth for public endpoints
        if request.url.path in _PUBLIC_PATHS or request.method == "OPTIONS":
            return await call_next(request)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header"},
            )

        token = auth_header.removeprefix("Bearer ").strip()
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
