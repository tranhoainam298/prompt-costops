"""
costops-dev — Wallet Route.

Endpoints for managing user token wallets, balances, and transactions in the real database.
"""

from __future__ import annotations

import logging
import uuid
import base64
from datetime import datetime, timezone, timedelta
from typing import Any

import httpx
from cryptography.fernet import Fernet
from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import get_settings
from database import get_db
from app.models.models import User, TokenWallet, UserRole, ApiKey
from app.routes.ws import ws_service

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/v1/wallet", tags=["wallet"])


def _get_fernet() -> Fernet:
    secret = settings.jwt_secret.encode()
    if len(secret) < 32:
        secret = secret.ljust(32, b'0')
    elif len(secret) > 32:
        secret = secret[:32]
    return Fernet(base64.urlsafe_b64encode(secret))


class WalletBalance(BaseModel):
    """Current wallet balance JSON schema."""
    user_id: str = ""
    balance_tokens: int = 0
    used_tokens: int = 0
    monthly_budget: int = 1_000_000
    currency: str = "tokens"


class TopUpRequest(BaseModel):
    """Request to add tokens to a wallet."""
    amount: int


class BindKeyRequest(BaseModel):
    """Request to bind an upstream API key."""
    provider: str
    api_key: str


async def get_or_create_wallet(session: AsyncSession, user_id_str: str) -> TokenWallet:
    """Get or dynamically seed a user and their wallet in the database."""
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")
        
    # Check if User exists
    user_stmt = select(User).where(User.id == user_uuid)
    result = await session.execute(user_stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        # Create dummy user for playground/dev
        user = User(
            id=user_uuid,
            email=f"playground_{user_uuid.hex[:8]}@costops.dev",
            username=f"playground_{user_uuid.hex[:8]}",
            password_hash="pbkdf2:sha256:default_hash",
            role=UserRole.member
        )
        session.add(user)
        await session.flush()
        
    # Check if wallet exists
    wallet_stmt = select(TokenWallet).where(TokenWallet.user_id == user_uuid)
    result = await session.execute(wallet_stmt)
    wallet = result.scalar_one_or_none()
    
    now = datetime.now(timezone.utc)
    
    if not wallet:
        wallet = TokenWallet(
            user_id=user_uuid,
            daily_limit_tokens=1_000_000,
            used_today_tokens=0,
            total_tokens_all_time=0,
            hard_limit_tokens=2_000_000,
            reset_at=now + timedelta(days=30)
        )
        session.add(wallet)
        await session.flush()
    else:
        # Strict reset condition
        reset_at = wallet.reset_at
        if reset_at.tzinfo is None:
            reset_at = reset_at.replace(tzinfo=timezone.utc)
            
        if now > reset_at:
            wallet.used_today_tokens = 0
            wallet.reset_at = now + timedelta(days=30)
            session.add(wallet)
            await session.flush()
            
    return wallet


@router.get("/balance", response_model=WalletBalance)
async def get_balance(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> WalletBalance:
    """Return the current wallet balance for the authenticated user."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    wallet = await get_or_create_wallet(db, user_id)
    return WalletBalance(
        user_id=user_id,
        balance_tokens=max(wallet.daily_limit_tokens - wallet.used_today_tokens, 0),
        used_tokens=wallet.used_today_tokens,
        monthly_budget=wallet.daily_limit_tokens,
    )


@router.post("/topup", response_model=WalletBalance)
async def top_up(
    request_data: TopUpRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> WalletBalance:
    """Add tokens to the authenticated user's wallet and broadcast via WebSocket."""
    user_id = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    
    wallet = await get_or_create_wallet(db, user_id)
    
    # Increase the wallet limit (top-up is adding quota/allowance)
    wallet.daily_limit_tokens += request_data.amount
    db.add(wallet)
    await db.commit()
    
    # Trigger live broadcast to alert frontend of changes
    ws_payload = {
        "userId": user_id,
        "balanceTokens": max(wallet.daily_limit_tokens - wallet.used_today_tokens, 0),
        "usedTokens": wallet.used_today_tokens,
        "monthlyBudget": wallet.daily_limit_tokens,
    }
    await ws_service.send_personal(user_id, ws_payload)
    
    return WalletBalance(
        user_id=user_id,
        balance_tokens=max(wallet.daily_limit_tokens - wallet.used_today_tokens, 0),
        used_tokens=wallet.used_today_tokens,
        monthly_budget=wallet.daily_limit_tokens,
    )


@router.post("/bind-key")
async def bind_key(
    request_data: BindKeyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    """Validate and securely bind an external API key to the user profile."""
    provider = request_data.provider.lower()
    api_key = request_data.api_key.strip()
    
    if provider == "openai":
        url = "https://api.openai.com/v1/models"
        headers = {"Authorization": f"Bearer {api_key}"}
    elif provider == "gemini":
        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
        headers = {}
    elif provider == "anthropic":
        url = "https://api.anthropic.com/v1/models" # simplified check or just users list
        headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
    else:
        raise HTTPException(status_code=400, detail="Unsupported provider")
        
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers)
        
    if resp.status_code in (401, 403, 400):
        raise HTTPException(status_code=400, detail="Invalid or inactive API Key credentials")
        
    # Get user
    user_id_str = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")
        
    await get_or_create_wallet(db, user_id_str)
    
    f = _get_fernet()
    encrypted_key = f.encrypt(api_key.encode()).decode("utf-8")
    
    stmt = select(ApiKey).where(ApiKey.user_id == user_uuid, ApiKey.name == provider)
    res = await db.execute(stmt)
    existing_key = res.scalar_one_or_none()
    
    if existing_key:
        existing_key.key_hash = encrypted_key
    else:
        new_key = ApiKey(
            user_id=user_uuid,
            name=provider,
            key_hash=encrypted_key
        )
        db.add(new_key)
        
    await db.commit()
    return {"status": "success", "provider": provider}


@router.get("/transactions")
async def get_transactions() -> dict[str, Any]:
    """Return the transaction history for the authenticated user."""
    return {"transactions": [], "total": 0}


@router.get("/status")
async def get_wallet_status(
    request: Request,
    db: AsyncSession = Depends(get_db)
) -> dict[str, bool]:
    """Check if the user has bound API keys for gemini or openai."""
    user_id_str = getattr(request.state, "user_id", None) or "00000000-0000-0000-0000-000000000000"
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        user_uuid = uuid.UUID("00000000-0000-0000-0000-000000000000")
        
    stmt = select(ApiKey).where(ApiKey.user_id == user_uuid, ApiKey.is_active == True)
    res = await db.execute(stmt)
    keys = res.scalars().all()
    
    bound_providers = {k.name.lower() for k in keys}
    return {
        "gemini_bound": "gemini" in bound_providers,
        "openai_bound": "openai" in bound_providers,
        "anthropic_bound": "anthropic" in bound_providers,
    }
