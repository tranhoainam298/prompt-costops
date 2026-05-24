"""
costops-dev — Smart Router.

Selects the most cost-effective provider and model for a given prompt based
on text complexity heuristics and optional user hints.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


# ── Cost table (USD per 1 K tokens) ─────────────────────

MODEL_CATALOG: dict[str, dict[str, float]] = {
    "openai": {
        "gpt-4o": 0.005,
        "gpt-4o-mini": 0.00015,
        "gpt-4-turbo": 0.01,
    },
    "anthropic": {
        "claude-sonnet-4-20250514": 0.003,
        "claude-3-haiku-20240307": 0.00025,
    },
    "deepseek": {
        "deepseek-chat": 0.00014,
        "deepseek-coder": 0.00014,
    },
}

# Ordered cheapest-first for fallback selection
_CHEAPEST_MODELS: list[tuple[str, str, float]] = sorted(
    [
        (provider, model, cost)
        for provider, models in MODEL_CATALOG.items()
        for model, cost in models.items()
    ],
    key=lambda x: x[2],
)


@dataclass
class RoutingDecision:
    """The result of a routing decision."""
    provider: str
    model: str
    cost_per_1k: float
    reason: str


class SmartRouter:
    """
    Chooses the best provider/model combo for a prompt.

    Strategy:
      • If the caller supplies a valid hint, honour it.
      • Otherwise, use text-length heuristics:
          – short prompts (< 500 chars)  → cheapest available model
          – medium prompts               → mid-tier model
          – long / complex prompts       → high-capability model
    """

    async def select_route(
        self,
        *,
        text: str,
        model_hint: str | None = None,
        provider_hint: str | None = None,
    ) -> RoutingDecision:
        """Return a ``RoutingDecision`` for the given prompt text."""

        # ── Honour explicit hints ────────────────────────
        if model_hint and provider_hint:
            cost = MODEL_CATALOG.get(provider_hint, {}).get(model_hint, 0.005)
            return RoutingDecision(
                provider=provider_hint,
                model=model_hint,
                cost_per_1k=cost,
                reason="user_hint",
            )

        if model_hint:
            for provider, models in MODEL_CATALOG.items():
                if model_hint in models:
                    return RoutingDecision(
                        provider=provider,
                        model=model_hint,
                        cost_per_1k=models[model_hint],
                        reason="model_hint_lookup",
                    )

        # ── Heuristic routing ────────────────────────────
        length = len(text)

        if length < 500:
            provider, model, cost = _CHEAPEST_MODELS[0]
            reason = "short_prompt_cheapest"
        elif length < 2000:
            mid_idx = len(_CHEAPEST_MODELS) // 2
            provider, model, cost = _CHEAPEST_MODELS[mid_idx]
            reason = "medium_prompt_balanced"
        else:
            provider, model, cost = _CHEAPEST_MODELS[-1]
            reason = "long_prompt_capable"

        return RoutingDecision(
            provider=provider,
            model=model,
            cost_per_1k=cost,
            reason=reason,
        )
