"""
costops-dev — Prompt Optimization Engine.

Executes three sequential stages on every inbound prompt:
  1. smart_routing   — selects the most cost-effective provider/model.
  2. compress_prompt — strips comments, redundant whitespace, and filler.
  3. template_standardizer — normalises the prompt into a canonical template.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any

from app.pipeline.router import SmartRouter
from app.pipeline.compressor import PromptCompressor
from app.pipeline.standardizer import TemplateStandardizer
from app.services.token_counter import TokenCounter

logger = logging.getLogger(__name__)


@dataclass
class OptimizationResult:
    """Container for the output of the full optimization pipeline."""

    original_text: str
    optimized_text: str
    selected_model: str
    selected_provider: str
    compression_ratio: float
    tokens_saved: int
    stages_applied: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class PromptOptimizationEngine:
    """
    Orchestrates the three-stage prompt optimization pipeline.

    Usage::

        engine = PromptOptimizationEngine()
        result = await engine.optimize(prompt_text, model_hint="gpt-4o")
    """

    def __init__(self) -> None:
        self.router = SmartRouter()
        self.compressor = PromptCompressor()
        self.standardizer = TemplateStandardizer()
        self.token_counter = TokenCounter(model="gpt-4o")

    # ── public API ───────────────────────────────────────

    async def optimize(
        self,
        text: str,
        *,
        model_hint: str | None = None,
        provider_hint: str | None = None,
        enable_compression: bool = True,
        enable_standardization: bool = True,
    ) -> OptimizationResult:
        """Run the full optimization pipeline and return an ``OptimizationResult``."""
        stages_applied: list[str] = []
        metadata: dict[str, Any] = {}

        original_text = text

        # ── Stage 1: Smart Routing ───────────────────────
        routing_decision = await self.router.select_route(
            text=text,
            model_hint=model_hint,
            provider_hint=provider_hint,
        )
        selected_model = routing_decision.model
        selected_provider = routing_decision.provider
        stages_applied.append("smart_routing")
        metadata["routing"] = {
            "model": selected_model,
            "provider": selected_provider,
            "reason": routing_decision.reason,
        }
        logger.info(
            "Stage 1 — routed to %s/%s (%s)",
            selected_provider,
            selected_model,
            routing_decision.reason,
        )

        # ── Stage 2: Compress Prompt ─────────────────────
        if enable_compression:
            text = self._compress(text)
            stages_applied.append("compress_prompt")
            logger.info(
                "Stage 2 — compressed from %d to %d chars",
                len(original_text),
                len(text),
            )

        # ── Stage 3: Template Standardizer ───────────────
        if enable_standardization:
            text = await self.standardizer.standardize(text)
            stages_applied.append("template_standardizer")
            logger.info("Stage 3 — template standardized")

        # ── Compute savings ──────────────────────────────
        original_tokens = self._estimate_tokens(original_text)
        optimized_tokens = self._estimate_tokens(text)
        tokens_saved = max(original_tokens - optimized_tokens, 0)
        compression_ratio = (
            round(1 - optimized_tokens / original_tokens, 4)
            if original_tokens > 0
            else 0.0
        )

        return OptimizationResult(
            original_text=original_text,
            optimized_text=text,
            selected_model=selected_model,
            selected_provider=selected_provider,
            compression_ratio=compression_ratio,
            tokens_saved=tokens_saved,
            stages_applied=stages_applied,
            metadata=metadata,
        )

    # ── private helpers ──────────────────────────────────

    def _compress(self, text: str) -> str:
        """
        Regex-based comment and whitespace cleaning.

        Removes:
          • Single-line comments  (// … and # …)
          • C-style block comments (/* … */)
          • Consecutive blank lines  (collapsed to one)
          • Leading / trailing whitespace on each line
        """
        # Strip single-line comments (// style)
        text = re.sub(r"//[^\n]*", "", text)
        # Strip single-line comments (# style, but not #! shebangs)
        text = re.sub(r"(?<!#)#\s[^\n]*", "", text)
        # Strip C-style block comments
        text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
        # Trim each line
        text = "\n".join(line.strip() for line in text.splitlines())
        # Collapse multiple blank lines into one
        text = re.sub(r"\n{3,}", "\n\n", text)
        # Final trim
        return text.strip()

    def _estimate_tokens(self, text: str) -> int:
        """
        Accurate token counting using the tiktoken TokenCounter service.
        """
        return self.token_counter.count(text)
