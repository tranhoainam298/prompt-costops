"""
costops-dev — Template Standardizer.

Normalises prompts into a canonical template format so downstream caching
and analytics can recognise structurally identical requests.
"""

from __future__ import annotations

import re
import logging

logger = logging.getLogger(__name__)


class TemplateStandardizer:
    """
    Converts free-form prompts into a canonical template.

    Steps:
      1. Normalise line endings.
      2. Detect and tag structural sections (system instruction, context, question).
      3. Trim unnecessary padding around section delimiters.
    """

    SECTION_MARKERS: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r"^(system\s*:)", re.IGNORECASE | re.MULTILINE), "[SYSTEM] "),
        (re.compile(r"^(context\s*:)", re.IGNORECASE | re.MULTILINE), "[CONTEXT] "),
        (re.compile(r"^(question\s*:)", re.IGNORECASE | re.MULTILINE), "[QUESTION] "),
        (re.compile(r"^(instruction\s*:)", re.IGNORECASE | re.MULTILINE), "[INSTRUCTION] "),
        (re.compile(r"^(user\s*:)", re.IGNORECASE | re.MULTILINE), "[USER] "),
        (re.compile(r"^(assistant\s*:)", re.IGNORECASE | re.MULTILINE), "[ASSISTANT] "),
    ]

    async def standardize(self, text: str) -> str:
        """Return the standardised form of *text*."""
        text = self._normalise_line_endings(text)
        text = self._tag_sections(text)
        text = self._trim_section_padding(text)
        return text

    # ── private helpers ──────────────────────────────────

    @staticmethod
    def _normalise_line_endings(text: str) -> str:
        return text.replace("\r\n", "\n").replace("\r", "\n")

    @classmethod
    def _tag_sections(cls, text: str) -> str:
        for pattern, replacement in cls.SECTION_MARKERS:
            text = pattern.sub(replacement, text)
        return text

    @staticmethod
    def _trim_section_padding(text: str) -> str:
        lines: list[str] = []
        for line in text.splitlines():
            stripped = line.strip()
            if stripped:
                lines.append(stripped)
            else:
                if lines and lines[-1] != "":
                    lines.append("")
        return "\n".join(lines).strip()
