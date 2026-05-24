"""
costops-dev — Wallet Route.

Endpoints for managing user token wallets, balances, and transactions.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/wallet", tags=["wallet"])


class WalletBalance(BaseModel):
    """Current wallet balance."""
    user_id: str = ""
    balance_tokens: int = 0
    used_tokens: int = 0
    monthly_budget: int = 1_000_000
    currency: str = "tokens"


class TopUpRequest(BaseModel):
    """Request to add tokens to a wallet."""
    amount: int


@router.get("/balance", response_model=WalletBalance)
async def get_balance() -> WalletBalance:
    """Return the current wallet balance for the authenticated user."""
    return WalletBalance()


@router.post("/topup", response_model=WalletBalance)
async def top_up(request: TopUpRequest) -> WalletBalance:
    """Add tokens to the authenticated user's wallet."""
    return WalletBalance(balance_tokens=request.amount)


@router.get("/transactions")
async def get_transactions() -> dict[str, Any]:
    """Return the transaction history for the authenticated user."""
    return {"transactions": [], "total": 0}
