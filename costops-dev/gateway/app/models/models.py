"""
costops-dev — Consolidated SQLAlchemy ORM Models.

Tables
------
  • ``users``          – application user accounts
  • ``teams``          – organisational teams with shared budgets
  • ``team_members``   – many-to-many join table (composite PK)
  • ``token_wallets``  – per-user daily/total token budgets
  • ``prompt_logs``    – audit trail for every optimised prompt

All primary keys use server-side UUID generation via ``uuid4``.
Timestamps are timezone-aware and default to ``utcnow``.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ── Helpers ──────────────────────────────────────────────

def _utcnow() -> datetime:
    """Return the current UTC time with timezone info."""
    return datetime.now(timezone.utc)


def _new_uuid() -> uuid.UUID:
    """Return a fresh UUID v4."""
    return uuid.uuid4()


# ── Enums ────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    """Allowed roles for a user account."""
    admin = "admin"
    member = "member"


# ═════════════════════════════════════════════════════════
#  User
# ═════════════════════════════════════════════════════════

class User(Base):
    """Application user account."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True,
    )
    username: Mapped[str] = mapped_column(
        String(128), unique=True, nullable=False, index=True,
    )
    password_hash: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", create_constraint=True),
        default=UserRole.member,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    owned_teams: Mapped[list["Team"]] = relationship(
        "Team", back_populates="owner", lazy="selectin",
    )
    wallet: Mapped["TokenWallet | None"] = relationship(
        "TokenWallet", back_populates="user", uselist=False, lazy="selectin",
    )
    team_memberships: Mapped[list["TeamMember"]] = relationship(
        "TeamMember", back_populates="user", lazy="selectin",
    )
    prompt_logs: Mapped[list["PromptLog"]] = relationship(
        "PromptLog", back_populates="user", lazy="noload",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


# ═════════════════════════════════════════════════════════
#  Team
# ═════════════════════════════════════════════════════════

class Team(Base):
    """Organisational team with a shared daily token budget."""

    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    name: Mapped[str] = mapped_column(
        String(128), nullable=False, unique=True,
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    default_daily_limit: Mapped[int] = mapped_column(
        Integer, default=500_000, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    owner: Mapped["User"] = relationship(
        "User", back_populates="owned_teams", lazy="selectin",
    )
    members: Mapped[list["TeamMember"]] = relationship(
        "TeamMember", back_populates="team", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Team id={self.id} name={self.name!r}>"


# ═════════════════════════════════════════════════════════
#  TeamMember  (composite PK)
# ═════════════════════════════════════════════════════════

class TeamMember(Base):
    """Many-to-many link between users and teams (composite PK)."""

    __tablename__ = "team_members"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        primary_key=True,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped["User"] = relationship(
        "User", back_populates="team_memberships", lazy="selectin",
    )
    team: Mapped["Team"] = relationship(
        "Team", back_populates="members", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<TeamMember user={self.user_id} team={self.team_id}>"


# ═════════════════════════════════════════════════════════
#  TokenWallet
# ═════════════════════════════════════════════════════════

class TokenWallet(Base):
    """Per-user token budget and usage counters."""

    __tablename__ = "token_wallets"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_token_wallets_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    daily_limit_tokens: Mapped[int] = mapped_column(
        Integer, default=500_000, nullable=False,
    )
    used_today_tokens: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
    )
    total_tokens_all_time: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
    )
    hard_limit_tokens: Mapped[int] = mapped_column(
        Integer, default=1_000_000, nullable=False,
    )
    reset_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped["User"] = relationship(
        "User", back_populates="wallet", lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<TokenWallet id={self.id} user={self.user_id} "
            f"used_today={self.used_today_tokens}/{self.daily_limit_tokens}>"
        )


# ═════════════════════════════════════════════════════════
#  PromptLog
# ═════════════════════════════════════════════════════════

class PromptLog(Base):
    """Audit row recorded after every prompt passes through the pipeline."""

    __tablename__ = "prompt_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    original_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    optimized_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    original_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    optimized_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    model_requested: Mapped[str] = mapped_column(String(64), nullable=False)
    model_used: Mapped[str] = mapped_column(String(64), nullable=False)
    source_tool: Mapped[str] = mapped_column(
        String(64), default="api", nullable=False,
    )
    compression_ratio: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False,
    )
    estimated_cost_usd: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped["User | None"] = relationship(
        "User", back_populates="prompt_logs", lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<PromptLog id={self.id} model_used={self.model_used!r} "
            f"saved={self.original_tokens - self.optimized_tokens}>"
        )
