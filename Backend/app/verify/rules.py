from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.clearance import AccessLevel, strictest_access

TRUST_PRECEDENCE = {
    "verified": 0,
    "partially_supported": 1,
    "unverified": 2,
    "missing_evidence": 3,
    "conflicting": 4,
    "system_rejected": 5,
}


@dataclass(frozen=True)
class EvidenceCheck:
    source_exists: bool
    excerpt_matches: bool
    future_date: bool = False


def normalize_excerpt(value: str) -> str:
    return " ".join(value.split()).casefold()


def excerpt_in_source(excerpt: str, source_text: str) -> bool:
    return normalize_excerpt(excerpt) in normalize_excerpt(source_text)


def label_single_claim(*, evidence_checks: list[EvidenceCheck], artifact_missing: bool, corroborated: bool, unconfirmable: bool = False) -> tuple[str, str]:
    if not evidence_checks or not all(check.source_exists for check in evidence_checks):
        return "system_rejected", "One or more evidence source IDs do not exist."
    if any(check.future_date for check in evidence_checks):
        return "unverified", "Evidence is dated in the future."
    if not all(check.excerpt_matches for check in evidence_checks):
        return "unverified", "One or more evidence excerpts do not match the source text."
    if artifact_missing:
        return "missing_evidence", "The claim references an artifact that is not present in the imported sources."
    if unconfirmable:
        return "unverified", "Evidence is present, but no deterministic rule can confirm the claim."
    if corroborated:
        return "verified", "Corroborated by two or more source records."
    return "partially_supported", "Supported by one source record."


def inherited_access(levels: list[str]) -> str:
    return strictest_access([AccessLevel(level) for level in levels]).value


def is_future(value: datetime | None) -> bool:
    return bool(value and value > datetime.now(UTC))
