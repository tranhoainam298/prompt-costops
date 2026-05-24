"""
costops-dev Gateway — Asynchronous Database Engine & Session Management.

Configures a production-ready SQLAlchemy 2.0 async engine backed by the
``asyncpg`` driver.  Exports:

  • ``Base``              – declarative base for all ORM models
  • ``async_session_factory`` – session maker bound to the engine
  • ``get_db()``          – FastAPI dependency that yields a scoped session
  • ``init_db()``         – creates all tables (dev convenience)
  • ``shutdown_db()``     – disposes the connection pool
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncAttrs,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# ── Async Engine ─────────────────────────────────────────
# The URL MUST use the ``postgresql+asyncpg://`` scheme.
# e.g. postgresql+asyncpg://costops:costops_secret@localhost:5432/costops_db

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args={
        "server_settings": {
            "application_name": settings.app_name,
        },
    },
)

# ── Session Factory ──────────────────────────────────────

async_session_factory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


# ── Declarative Base ─────────────────────────────────────

class Base(AsyncAttrs, DeclarativeBase):
    """Declarative base class shared by every ORM model in the gateway."""
    pass


# ── FastAPI Dependency ───────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an ``AsyncSession`` scoped to a single request.

    • Commits on success.
    • Rolls back on any unhandled exception.
    • Always closes the session when the request finishes.
    """
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Lifecycle Hooks ──────────────────────────────────────

async def init_db() -> None:
    """Create all tables that don't yet exist (development convenience)."""
    # Import models so their metadata is registered on ``Base`` before
    # ``create_all`` runs.
    import app.models.models  # noqa: F401

    logger.info("Running Base.metadata.create_all …")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready.")


async def shutdown_db() -> None:
    """Dispose of the engine's connection pool on application shutdown."""
    logger.info("Disposing database connection pool …")
    await engine.dispose()
