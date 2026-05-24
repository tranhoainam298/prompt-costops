"""
costops-dev Gateway — FastAPI Application Entry Point.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import init_db, shutdown_db
from app.routes.chat import router as chat_router
from app.routes.usage import router as usage_router
from app.routes.wallet import router as wallet_router
from app.middleware.auth import AuthMiddleware
from app.middleware.quota_guard import QuotaGuardMiddleware

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(application: FastAPI):
    """Manage startup and shutdown lifecycle events."""
    logger.info("Starting %s in %s mode", settings.app_name, settings.environment)
    await init_db()
    yield
    logger.info("Shutting down %s", settings.app_name)
    await shutdown_db()


app = FastAPI(
    title="CostOps Gateway",
    description="AI Prompt Optimization & Cost Management Gateway",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/v1/docs",
    openapi_url="/v1/openapi.json",
)

# ── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Custom Middleware ────────────────────────────────────
app.add_middleware(QuotaGuardMiddleware)
app.add_middleware(AuthMiddleware)

# ── Routers ──────────────────────────────────────────────
app.include_router(chat_router)
app.include_router(usage_router)
app.include_router(wallet_router)


@app.get("/health", tags=["system"])
async def health_check():
    """Liveness probe endpoint."""
    return {"status": "ok", "service": settings.app_name}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.environment == "development",
        log_level=settings.log_level,
    )
