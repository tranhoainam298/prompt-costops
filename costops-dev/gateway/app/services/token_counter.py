"""
costops-dev — Token Counter Service.

Production-grade token counting using ``tiktoken``.  Supports multiple
encoding schemes and provides helpers for:

  • plain text counting
  • chat-message counting (with per-message overhead)
  • side-by-side compression benchmarking
  • model-aware encoding selection
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import tiktoken

logger = logging.getLogger(__name__)

# ── Encoding Resolution ──────────────────────────────────

# Map well-known model prefixes to their tiktoken encoding names.
_MODEL_ENCODING_MAP: dict[str, str] = {
    "gpt-4o": "o200k_base",
    "gpt-4-turbo": "cl100k_base",
    "gpt-4": "cl100k_base",
    "gpt-3.5-turbo": "cl100k_base",
    "claude": "cl100k_base",       # approximate; Anthropic uses its own tokenizer
    "deepseek": "cl100k_base",     # DeepSeek exposes an OpenAI-compatible surface
}


@lru_cache(maxsize=8)
def _get_encoding(name: str) -> tiktoken.Encoding:
    """Return a cached ``tiktoken.Encoding`` by name."""
    return tiktoken.get_encoding(name)


def _resolve_encoding(model: str) -> tiktoken.Encoding:
    """
    Pick the best tiktoken encoding for *model*.

    Falls back to ``cl100k_base`` when the model is unknown.
    """
    for prefix, enc_name in _MODEL_ENCODING_MAP.items():
        if model.startswith(prefix):
            return _get_encoding(enc_name)
    return _get_encoding("cl100k_base")


# ── Benchmark Result ─────────────────────────────────────

@dataclass
class CompressionBenchmark:
    """Result of comparing an original prompt with its compressed version."""
    original_tokens: int
    optimized_tokens: int
    tokens_saved: int
    compression_ratio: float
    encoding_name: str


# ── TokenCounter Class ───────────────────────────────────

class TokenCounter:
    """
    Accurately encode and count tokens for any string.

    Usage::

        counter = TokenCounter()                   # cl100k_base default
        counter = TokenCounter(model="gpt-4o")     # auto-resolve to o200k_base

        n = counter.count("Hello, world!")
        n = counter.count_messages([{"role": "user", "content": "Hi"}])
        b = counter.benchmark("original text", "compressed text")
    """

    def __init__(
        self,
        *,
        model: str = "gpt-4o",
        encoding_name: str | None = None,
    ) -> None:
        if encoding_name is not None:
            self.encoding = _get_encoding(encoding_name)
        else:
            self.encoding = _resolve_encoding(model)
        self.encoding_name: str = self.encoding.name

    # ── Core counting ────────────────────────────────────

    def count(self, text: str) -> int:
        """Return the exact token count for a plain-text string."""
        if not text:
            return 0
        return len(self.encoding.encode(text))

    def count_messages(
        self,
        messages: list[dict[str, Any]],
        *,
        tokens_per_message: int = 4,
        tokens_per_name: int = -1,
        reply_priming: int = 2,
    ) -> int:
        """
        Count tokens across a list of OpenAI-style chat messages.

        Token overhead mirrors the OpenAI cookbook recommendation:
          • *tokens_per_message*  – overhead per message (role, delimiters).
          • *tokens_per_name*     – added when a ``name`` field is present
                                    (set to -1 for gpt-4o which removes a
                                    role token when a name is given).
          • *reply_priming*       – fixed overhead for the assistant turn.
        """
        num_tokens = 0
        for message in messages:
            num_tokens += tokens_per_message
            for key, value in message.items():
                num_tokens += len(self.encoding.encode(str(value)))
                if key == "name":
                    num_tokens += tokens_per_name
        num_tokens += reply_priming
        return num_tokens

    # ── Compression benchmarking ─────────────────────────

    def benchmark(
        self,
        original: str,
        optimized: str,
    ) -> CompressionBenchmark:
        """
        Compare *original* vs *optimized* text and return savings metrics.

        Useful for validating prompt-compression effectiveness in CI or
        logging pipelines.
        """
        original_tokens = self.count(original)
        optimized_tokens = self.count(optimized)
        tokens_saved = max(original_tokens - optimized_tokens, 0)
        ratio = (
            round(1 - optimized_tokens / original_tokens, 4)
            if original_tokens > 0
            else 0.0
        )
        return CompressionBenchmark(
            original_tokens=original_tokens,
            optimized_tokens=optimized_tokens,
            tokens_saved=tokens_saved,
            compression_ratio=ratio,
            encoding_name=self.encoding_name,
        )

    # ── Convenience class methods ────────────────────────

    @classmethod
    def for_model(cls, model: str) -> "TokenCounter":
        """Factory that auto-resolves the encoding for *model*."""
        return cls(model=model)
