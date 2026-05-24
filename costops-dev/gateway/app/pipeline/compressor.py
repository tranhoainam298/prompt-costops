"""
costops-dev — Prompt Compressor.

Applies regex-based cleaning passes to strip comments, collapse whitespace,
and remove filler phrases to reduce token count without altering semantics.
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)

# Filler phrases that can be safely removed without changing meaning
_FILLER_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\bplease\b", re.IGNORECASE),
    re.compile(r"\bkindly\b", re.IGNORECASE),
    re.compile(r"\bI would like you to\b", re.IGNORECASE),
    re.compile(r"\bCould you please\b", re.IGNORECASE),
    re.compile(r"\bCan you\b", re.IGNORECASE),
    re.compile(r"\bI want you to\b", re.IGNORECASE),
    re.compile(r"\bI need you to\b", re.IGNORECASE),
]


class PromptCompressor:
    """
    Multi-pass prompt compressor.

    Passes (in order):
      1. Strip single-line comments (``//`` and ``#``)
      2. Strip block comments (``/* … */``)
      3. Remove common filler phrases
      4. Collapse redundant whitespace
    """

    def compress(self, text: str) -> str:
        """Return a compressed version of *text*."""
        original_len = len(text)

        text = self._strip_single_line_comments(text)
        text = self._strip_block_comments(text)
        text = self._remove_filler(text)
        text = self._collapse_whitespace(text)

        logger.debug(
            "Compressed %d → %d chars (%.1f%%)",
            original_len,
            len(text),
            (1 - len(text) / original_len) * 100 if original_len else 0,
        )
        return text

    # ── private passes ───────────────────────────────────

    @staticmethod
    def _strip_single_line_comments(text: str) -> str:
        text = re.sub(r"//[^\n]*", "", text)
        text = re.sub(r"(?<!#)#\s[^\n]*", "", text)
        return text

    @staticmethod
    def _strip_block_comments(text: str) -> str:
        return re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)

    @staticmethod
    def _remove_filler(text: str) -> str:
        for pattern in _FILLER_PATTERNS:
            text = pattern.sub("", text)
        return text

    @staticmethod
    def _collapse_whitespace(text: str) -> str:
        text = "\n".join(line.strip() for line in text.splitlines())
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        return text.strip()
