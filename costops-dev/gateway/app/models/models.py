"""
costops-dev — Consolidated SQLAlchemy ORM Models.

Contains the full 12-table capstone database schema for unified cost tracking.
All primary keys and foreign keys use UUIDs uniformly.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any

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
    Boolean,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
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


class SkillStatus(str, enum.Enum):
    """Status of user skill mastery."""
    weak = "weak"
    average = "average"
    strong = "strong"


class AlertType(str, enum.Enum):
    """Types of cost alerts."""
    leak = "leak"
    budget_warning = "budget_warning"


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
    owned_teams: Mapped[list[Team]] = relationship(
        "Team", back_populates="owner", lazy="selectin",
    )
    wallet: Mapped[TokenWallet | None] = relationship(
        "TokenWallet", back_populates="user", uselist=False, lazy="selectin",
    )
    team_memberships: Mapped[list[TeamMember]] = relationship(
        "TeamMember", back_populates="user", lazy="selectin",
    )
    prompt_logs: Mapped[list[PromptLog]] = relationship(
        "PromptLog", back_populates="user", lazy="noload",
    )
    api_keys: Mapped[list[ApiKey]] = relationship(
        "ApiKey", back_populates="user", lazy="selectin",
    )
    routing_rules: Mapped[list[RoutingRule]] = relationship(
        "RoutingRule", back_populates="user", lazy="selectin",
    )
    skills: Mapped[list[UserSkill]] = relationship(
        "UserSkill", back_populates="user", lazy="selectin",
    )
    quiz_attempts: Mapped[list[QuizAttempt]] = relationship(
        "QuizAttempt", back_populates="user", lazy="noload",
    )
    cost_alerts: Mapped[list[CostAlert]] = relationship(
        "CostAlert", back_populates="user", lazy="selectin",
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
    owner: Mapped[User] = relationship(
        "User", back_populates="owned_teams", lazy="selectin",
    )
    members: Mapped[list[TeamMember]] = relationship(
        "TeamMember", back_populates="team", lazy="selectin",
    )
    routing_rules: Mapped[list[RoutingRule]] = relationship(
        "RoutingRule", back_populates="team", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Team id={self.id} name={self.name!r}>"


# ═════════════════════════════════════════════════════════
#  TeamMember
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
    user: Mapped[User] = relationship(
        "User", back_populates="team_memberships", lazy="selectin",
    )
    team: Mapped[Team] = relationship(
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
    user: Mapped[User] = relationship(
        "User", back_populates="wallet", lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<TokenWallet id={self.id} user={self.user_id} "
            f"used_today={self.used_today_tokens}/{self.daily_limit_tokens}>"
        )


# ═════════════════════════════════════════════════════════
#  ApiKey
# ═════════════════════════════════════════════════════════

class ApiKey(Base):
    """Per-user API key management."""

    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    key_hash: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", back_populates="api_keys", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<ApiKey id={self.id} user={self.user_id} name={self.name!r}>"


# ═════════════════════════════════════════════════════════
#  RoutingRule
# ═════════════════════════════════════════════════════════

class RoutingRule(Base):
    """Custom provider routing rules per user or team."""

    __tablename__ = "routing_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    provider: Mapped[str] = mapped_column(
        String(64), nullable=False,
    )
    model: Mapped[str] = mapped_column(
        String(64), nullable=False,
    )
    priority: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped[User | None] = relationship(
        "User", back_populates="routing_rules", lazy="selectin",
    )
    team: Mapped[Team | None] = relationship(
        "Team", back_populates="routing_rules", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<RoutingRule id={self.id} provider={self.provider} model={self.model}>"


# ═════════════════════════════════════════════════════════
#  PromptLog
# ═════════════════════════════════════════════════════════

class PromptLog(Base):
    """Audit row recorded after every prompt passes through the pipeline."""

    __tablename__ = "prompt_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
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
    user: Mapped[User | None] = relationship(
        "User", back_populates="prompt_logs", lazy="selectin",
    )
    explanations: Mapped[list[AIExplanation]] = relationship(
        "AIExplanation", back_populates="prompt_log", lazy="selectin",
    )

    def __repr__(self) -> str:
        return (
            f"<PromptLog id={self.id} model_used={self.model_used!r} "
            f"saved={self.original_tokens - self.optimized_tokens}>"
        )


# ═════════════════════════════════════════════════════════
#  AIExplanation
# ═════════════════════════════════════════════════════════

class AIExplanation(Base):
    """Concept explanations linked to prompt logs."""

    __tablename__ = "ai_explanations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    log_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("prompt_logs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concept_name: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    explanation_summary: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    prompt_log: Mapped[PromptLog] = relationship(
        "PromptLog", back_populates="explanations", lazy="selectin",
    )
    quizzes: Mapped[list[SocraticQuiz]] = relationship(
        "SocraticQuiz", back_populates="explanation", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<AIExplanation id={self.id} concept={self.concept_name!r}>"


# ═════════════════════════════════════════════════════════
#  UserSkill
# ═════════════════════════════════════════════════════════

class UserSkill(Base):
    """Per-user skill mastery tracking."""

    __tablename__ = "user_skills"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    skill_name: Mapped[str] = mapped_column(
        String(128), nullable=False,
    )
    mastery_score: Mapped[float] = mapped_column(
        Float, default=0.0, nullable=False,
    )
    status: Mapped[SkillStatus] = mapped_column(
        Enum(SkillStatus, name="skill_status", create_constraint=True),
        default=SkillStatus.weak,
        nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", back_populates="skills", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<UserSkill skill={self.skill_name!r} score={self.mastery_score}>"


# ═════════════════════════════════════════════════════════
#  SocraticQuiz
# ═════════════════════════════════════════════════════════

class SocraticQuiz(Base):
    """Quiz questions generated from AI explanations."""

    __tablename__ = "socratic_quizzes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    explanation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_explanations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_text: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    options: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False,
    )
    correct_option: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    explanation: Mapped[AIExplanation] = relationship(
        "AIExplanation", back_populates="quizzes", lazy="selectin",
    )
    attempts: Mapped[list[QuizAttempt]] = relationship(
        "QuizAttempt", back_populates="quiz", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<SocraticQuiz id={self.id}>"


# ═════════════════════════════════════════════════════════
#  QuizAttempt
# ═════════════════════════════════════════════════════════

class QuizAttempt(Base):
    """User quiz attempt records."""

    __tablename__ = "quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quiz_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("socratic_quizzes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    selected_option: Mapped[str] = mapped_column(
        String(255), nullable=False,
    )
    is_correct: Mapped[bool] = mapped_column(
        Boolean, nullable=False,
    )
    attempted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", back_populates="quiz_attempts", lazy="selectin",
    )
    quiz: Mapped[SocraticQuiz] = relationship(
        "SocraticQuiz", back_populates="attempts", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<QuizAttempt id={self.id} correct={self.is_correct}>"


# ═════════════════════════════════════════════════════════
#  CostAlert
# ═════════════════════════════════════════════════════════

class CostAlert(Base):
    """Budget warnings and leak detection alerts."""

    __tablename__ = "cost_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=_new_uuid,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    alert_type: Mapped[AlertType] = mapped_column(
        Enum(AlertType, name="alert_type", create_constraint=True),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(
        Text, nullable=False,
    )
    is_read: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False,
    )

    # ── Relationships ────────────────────────────────────
    user: Mapped[User] = relationship(
        "User", back_populates="cost_alerts", lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<CostAlert id={self.id} type={self.alert_type}>"
