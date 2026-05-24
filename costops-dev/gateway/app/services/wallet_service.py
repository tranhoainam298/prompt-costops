"""
costops-dev — Wallet Service.

Business logic for managing user token wallets: balance checks,
debits, credits, and budget enforcement.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

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
    """Manages token wallet operations."""

    def __init__(self) -> None:
        self._balances: dict[str, int] = {}

    async def get_balance(self, user_id: str) -> int:
        """Return the current token balance for a user."""
        return self._balances.get(user_id, 0)

    async def debit(self, user_id: str, amount: int, description: str = "") -> WalletTransaction:
        """Deduct tokens from a user's wallet."""
        current = self._balances.get(user_id, 0)
        new_balance = max(current - amount, 0)
        self._balances[user_id] = new_balance
        logger.info("Wallet debit: user=%s amount=%d balance=%d", user_id, amount, new_balance)
        return WalletTransaction(
            user_id=user_id,
            amount=-amount,
            transaction_type="debit",
            description=description,
            balance_after=new_balance,
        )

    async def credit(self, user_id: str, amount: int, description: str = "") -> WalletTransaction:
        """Add tokens to a user's wallet."""
        current = self._balances.get(user_id, 0)
        new_balance = current + amount
        self._balances[user_id] = new_balance
        logger.info("Wallet credit: user=%s amount=%d balance=%d", user_id, amount, new_balance)
        return WalletTransaction(
            user_id=user_id,
            amount=amount,
            transaction_type="credit",
            description=description,
            balance_after=new_balance,
        )

    async def has_budget(self, user_id: str, required: int) -> bool:
        """Check whether a user has enough tokens for a request."""
        return (self._balances.get(user_id, 0)) >= required
