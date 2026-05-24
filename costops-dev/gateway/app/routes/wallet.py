"""
costops-dev — Wallet Route.

Endpoints for managing user token wallets, balances, and transactions in the real database.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, Request, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from app.models.models import User, TokenWallet, UserRole
from app.routes.ws import ws_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/wallet", tags=["wallet"])


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
    
    if not wallet:
        wallet = TokenWallet(
            user_id=user_uuid,
            daily_limit_tokens=1_000_000,
            used_today_tokens=0,
            total_tokens_all_time=0,
            hard_limit_tokens=2_000_000
        )
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


@router.get("/transactions")
async def get_transactions() -> dict[str, Any]:
    """Return the transaction history for the authenticated user."""
    return {"transactions": [], "total": 0}
