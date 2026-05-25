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
import os
import httpx
from dataclasses import dataclass, field
from typing import Any

from config import get_settings

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

    DYNAMIC_COMPILER_INSTRUCTION = (
        "You are an Advanced Semantic Compiler. Strip conversational fluff, politeness, and redundancies from the input. "
        "Do not use a fixed template. Analyze input intent and dynamically structure into the most token-efficient, high-density layout:\n"
        "- Feature Requests: use tags like [Core Goal], [Tech Stack], [Logic Gates].\n"
        "- Code Debugging: use tags like [Error Context], [Target Code], [Expected Behavior].\n"
        "- General Conceptual Ideation: use tags like [Objective], [Core Constraints].\n"
        "If input is already optimized, output only dense refined directives without structural tags. Minimize token footprint, "
        "maximize clarity. Never output literal placeholders."
    )

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

        # ── Stage 2 & 3: Advanced Semantic Prompt Optimizer
        if enable_compression or enable_standardization:
            optimized_text = self.optimize_user_prompt(original_text)
            if optimized_text:
                text = optimized_text
            else:
                text = original_text.strip()
            stages_applied.extend(["compress_prompt", "template_standardizer"])

        # ── Compute savings ──────────────────────────────
        original_tokens = self._estimate_tokens(original_text)
        optimized_tokens = self._estimate_tokens(text)
        tokens_saved = max(original_tokens - optimized_tokens, 0)
        compression_ratio = (
            max(0.0, round(1 - optimized_tokens / original_tokens, 4))
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

    def optimize_user_prompt(self, raw_prompt: str) -> str:
        """
        Advanced Dynamic Semantic Compiler prompt optimization.
        Uses an LLM to dynamically format and compress the prompt based on its domain.
        """
        stripped_prompt = raw_prompt.strip()
        if not stripped_prompt:
            return ""
        # Gracefully handle edge cases where input intent is minimal or already brief
        if len(stripped_prompt) < 15:
            return stripped_prompt

        # Retrieve Gemini key from config or environment
        settings = get_settings()
        api_key = getattr(settings, "gemini_api_key", None) or os.getenv("GEMINI_API_KEY")
        print(f"CRITICAL LOG - Is API Key loaded? {bool(api_key)}")
        if not api_key:
            logger.warning("GEMINI_API_KEY not found in settings or env. Falling back to rule-based compression.")
            return self._fallback_rule_based(raw_prompt)

        system_prompt = self.DYNAMIC_COMPILER_INSTRUCTION

        try:
            # We use the OpenAI-compatible endpoint of Google Gemini API
            url = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            body = {
                "model": "gemini-2.5-flash",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": raw_prompt}
                ],
                "temperature": 0.2,
                "stream": False
            }
            
            with httpx.Client(timeout=10.0) as client:
                response = client.post(url, headers=headers, json=body)
                if response.status_code == 200:
                    data = response.json()
                    optimized_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    if optimized_text:
                        logger.info("Stage 2 & 3 — dynamic semantic optimization succeeded")
                        return optimized_text.strip()
                print(f"GEMINI API EXECUTION FAILED with status {response.status_code}: {response.text}")
                response.raise_for_status()
        except Exception as e:
            print(f"GEMINI API EXECUTION FAILED: {str(e)}")
            logger.error(f"Error during dynamic semantic optimization: {str(e)}")
            raise e

    def _fallback_rule_based(self, raw_prompt: str) -> str:
        """Rule-based fallback optimization when LLM optimization fails."""
        text = raw_prompt
        fluffs = [
            r"(?i)viết hộ tôi cái\s*",
            r"(?i)\s*nha ai\.?",
            r"(?i)mà nhớ là\s*",
            r"(?i)chào bạn,?\s*",
            r"(?i)cảm ơn bạn rất nhiều\.?",
            r"(?i)nhớ làm kĩ nha\.?",
            r"(?i)\s*với\.\.\.",
            r"(?i)\s*với error\.\.\."
        ]
        for f in fluffs:
            text = re.sub(f, "", text)
            
        compressed_text = text.strip()
        
        # Basic dynamic category selection
        if "error" in compressed_text.lower() or "bug" in compressed_text.lower() or "fail" in compressed_text.lower():
            return (
                f"**[Error Context]**\n{compressed_text}\n\n"
                f"**[Target Code]**\nUnspecified\n\n"
                f"**[Expected Behavior]**\nFix the error and ensure correct behavior."
            )
        elif "feature" in compressed_text.lower() or "create" in compressed_text.lower() or "build" in compressed_text.lower() or "react" in compressed_text.lower():
            return (
                f"**[Core Goal]**\n{compressed_text}\n\n"
                f"**[Tech Stack]**\nReact/TypeScript\n\n"
                f"**[Logic Gates]**\nClean implementation with responsive layout"
            )
        else:
            return (
                f"**[Objective]**\n{compressed_text}\n\n"
                f"**[Core Constraints]**\nStrict production standards"
            )

    def _compress(self, text: str) -> str:
        """
        Strips conversational fluff and whitespace.
        """
        # Fluff removal (simulating the 280 -> 110 char compression)
        fluffs = [
            r"(?i)viết hộ tôi cái\s*",
            r"(?i)\s*nha ai\.?",
            r"(?i)mà nhớ là\s*",
        ]
        compressed = text
        for f in fluffs:
            compressed = re.sub(f, "", compressed)
            
        compressed = "\n".join(line.strip() for line in compressed.splitlines())
        compressed = re.sub(r"\n{3,}", "\n\n", compressed)
        return compressed.strip()

    def _estimate_tokens(self, text: str) -> int:
        """
        Accurate token counting using the tiktoken TokenCounter service.
        """
        return self.token_counter.count(text)
