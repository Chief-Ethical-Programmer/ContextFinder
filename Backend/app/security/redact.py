import re
from dataclasses import dataclass


@dataclass(frozen=True)
class RedactionResult:
    text: str
    redacted: bool
    count: int


_PATTERNS = (
    re.compile(r"(?i)\b(?:password|passwd|api[_-]?key|secret|token)\s*=\s*[^\s,;]+"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
)


def redact_secrets(text: str) -> RedactionResult:
    count = 0
    redacted_text = text
    for pattern in _PATTERNS:
        redacted_text, replacements = pattern.subn("[redacted]", redacted_text)
        count += replacements
    return RedactionResult(redacted_text, count > 0, count)
