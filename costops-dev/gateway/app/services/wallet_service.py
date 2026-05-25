"""
costops-dev — Wallet Service.

Business logic for managing user token wallets: balance checks,
debits, credits, and budget enforcement via database.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.models import TokenWallet

logger = logging.getLogger(__name__)


@dataclass
class WalletTransaction:
    """A single wallet transaction record."""
    user_id: str
    amount: int
    transaction_type: str  # "debit" | "credit"
    description: str
    balance_after: int


class WalletService:
    """Manages token wallet operations using database persistence."""

    async def _get_wallet(self, session: AsyncSession, user_id: str) -> TokenWallet | None:
        try:
            uid = uuid.UUID(user_id)
        except ValueError:
            return None
            
        stmt = select(TokenWallet).where(TokenWallet.user_id == uid)
        result = await session.execute(stmt)
        wallet = result.scalar_one_or_none()
        
        # Check reset condition
        now = datetime.now(timezone.utc)
        if wallet and wallet.reset_at:
            # Ensure timezone awareness for comparison
            reset_at = wallet.reset_at
            if reset_at.tzinfo is None:
                reset_at = reset_at.replace(tzinfo=timezone.utc)
                
            if now > reset_at:
                # Reset usage for new cycle
                wallet.used_today_tokens = 0
                wallet.reset_at = now + timedelta(days=30)
                session.add(wallet)
                await session.commit()
                await session.refresh(wallet)
            
        return wallet

    async def get_balance(self, session: AsyncSession, user_id: str) -> int:
        """Return the current token balance for a user."""
        wallet = await self._get_wallet(session, user_id)
        if not wallet:
            return 0
        return max(wallet.daily_limit_tokens - wallet.used_today_tokens, 0)

    async def debit(self, session: AsyncSession, user_id: str, amount: int, description: str = "") -> WalletTransaction:
        """Deduct tokens from a user's wallet."""
        wallet = await self._get_wallet(session, user_id)
        if not wallet:
            # Fallback for unconnected users
            return WalletTransaction(user_id, -amount, "debit", description, 0)
            
        new_used = wallet.used_today_tokens + amount
        wallet.used_today_tokens = new_used
        wallet.total_tokens_all_time += amount
        session.add(wallet)
        await session.commit()
        
        new_balance = max(wallet.daily_limit_tokens - new_used, 0)
        logger.info("Wallet debit: user=%s amount=%d balance=%d", user_id, amount, new_balance)
        return WalletTransaction(
            user_id=user_id,
            amount=-amount,
            transaction_type="debit",
            description=description,
            balance_after=new_balance,
        )

    async def credit(self, session: AsyncSession, user_id: str, amount: int, description: str = "") -> WalletTransaction:
        """Add tokens to a user's wallet."""
        wallet = await self._get_wallet(session, user_id)
        if not wallet:
            return WalletTransaction(user_id, amount, "credit", description, amount)
            
        # Refunding tokens means reducing used_today_tokens
        new_used = max(wallet.used_today_tokens - amount, 0)
        wallet.used_today_tokens = new_used
        session.add(wallet)
        await session.commit()
        
        new_balance = max(wallet.daily_limit_tokens - new_used, 0)
        logger.info("Wallet credit: user=%s amount=%d balance=%d", user_id, amount, new_balance)
        return WalletTransaction(
            user_id=user_id,
            amount=amount,
            transaction_type="credit",
            description=description,
            balance_after=new_balance,
        )

    async def has_budget(self, session: AsyncSession, user_id: str, required: int) -> bool:
        """Check whether a user has enough tokens for a request."""
        bal = await self.get_balance(session, user_id)
        return bal >= required
