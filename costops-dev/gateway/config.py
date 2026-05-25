"""
costops-dev Gateway — Application Configuration.
Centralized settings loaded from environment variables with sensible defaults.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings sourced from environment variables."""

    # ── Application ──────────────────────────────────────
    app_name: str = "costops-gateway"
    environment: str = "development"
    log_level: str = "info"
    debug: bool = False

    # ── Database ─────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://costops:costops_secret@localhost:5433/costops_db"

    # ── Redis ────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Auth / JWT ───────────────────────────────────────
    jwt_secret: str = "changeme_jwt_secret_key"
    jwt_algorithm: str = "HS256"
    jwt_expiration_minutes: int = 1440

    # ── Provider API Keys ────────────────────────────────
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    deepseek_api_key: str = ""
    gemini_api_key: str = ""

    # ── Rate Limits ──────────────────────────────────────
    default_rate_limit: int = 60
    default_monthly_token_budget: int = 1_000_000

    model_config = {"env_file": [".env", "../.env"], "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    """Return a cached singleton of application settings."""
    return Settings()
