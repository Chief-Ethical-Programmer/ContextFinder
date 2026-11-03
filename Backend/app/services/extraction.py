import re
from collections import defaultdict
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ClaimEvidence,
    ConflictPair,
    Dependency,
    KnowledgeClaim,
    Project,
    SourceConnection,
    SourceRecord,
    Transition,
)
from app.llm.provider import get_llm_client
from app.llm.schemas import CandidateEvidence, ChunkInput
from app.verify.rules import EvidenceCheck, inherited_access, is_future, label_single_claim

CHUNK_CHARS = 12_000
CHUNK_OVERLAP = 600
MAX_GEMINI_CHUNKS = 60


def text_chunks(text: str) -> list[str]:
    normalized = text.strip()
    if len(normalized) <= CHUNK_CHARS:
        return [normalized] if normalized else []
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + CHUNK_CHARS)
        if end < len(normalized):
            boundary = normalized.rfind("\n", start + CHUNK_CHARS // 2, end)
            if boundary > start:
                end = boundary
        chunks.append(normalized[start:end])
        if end == len(normalized):
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
    return chunks


def _normalize_subject(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.casefold()).strip("_")[:200]


async def extract_and_verify(db: AsyncSession, transition_id: UUID, *, replace_existing: bool = False) -> dict:
    existing_ids = list((await db.scalars(select(KnowledgeClaim.id).where(KnowledgeClaim.transition_id == transition_id))).all())
    if existing_ids:
        if not replace_existing:
            return {"records": 0, "claims": 0, "systemRejected": 0, "conflicts": 0, "skipped": True}
        await db.execute(delete(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id))

    records = list((await db.scalars(
        select(SourceRecord)
        .join(SourceConnection)
        .where(SourceConnection.transition_id == transition_id)
        .order_by(SourceRecord.occurred_at, SourceRecord.id)
    )).all())
    if not records:
        raise ValueError("No source records are available to extract claims from.")

    transition = await db.get(Transition, transition_id)
    project = await db.get(Project, transition.project_id) if transition else None
    project_context = (project.description or "")[:4_000] if project else ""

    work_items = [(record, chunk) for record in records for chunk in text_chunks(record.text)]
    if len(work_items) > MAX_GEMINI_CHUNKS:
        raise ValueError(f"This free-tier demo is limited to {MAX_GEMINI_CHUNKS} Gemini requests per handover. Reduce the selected source records and retry.")

    client = get_llm_client()
    claims: list[KnowledgeClaim] = []
    by_subject: dict[str, list[KnowledgeClaim]] = defaultdict(list)
    rejected = 0
    for record, chunk in work_items:
        candidates = await client.extract_claims(ChunkInput(
            source_record_id=record.id, text=chunk, kind=record.kind, author=record.author, url=record.url,
            project_context=project_context,
        ))
        external_reference = bool((record.metadata_json or {}).get("retrieved_by_gemini"))
        for candidate in candidates:
            evidence_checks: list[EvidenceCheck] = []
            evidence_records: list[tuple[CandidateEvidence, SourceRecord]] = []
            for cited in candidate.evidence:
                source = next((item for item in records if item.id == cited.source_record_id), None)
                if source is None:
                    evidence_checks.append(EvidenceCheck(False, False))
                    continue
                evidence_records.append((cited, source))
                excerpt_matches = external_reference or " ".join(cited.excerpt.split()).casefold() in " ".join(source.text.split()).casefold()
                evidence_checks.append(EvidenceCheck(True, excerpt_matches, is_future(source.occurred_at)))

            referenced = candidate.referenced_artifact
            label, reason = label_single_claim(
                evidence_checks=evidence_checks,
                artifact_missing=bool(referenced and not referenced.resolved),
                corroborated=False,
                unconfirmable=external_reference,
            )
            subject = _normalize_subject(candidate.subject_key or candidate.statement)
            claim = KnowledgeClaim(
                transition_id=transition_id,
                type=candidate.type,
                statement=candidate.statement.strip(),
                subject_key=subject,
                status_value=candidate.status_value,
                trust_label=label,
                trust_reason=reason,
                access_level=inherited_access([source.access_level for _, source in evidence_records] or [record.access_level]),
                origin="system",
                review_state="system_rejected" if label == "system_rejected" else "proposed",
                current_version=1,
                occurred_at=candidate.occurred_at or record.occurred_at,
                flags={"referencedArtifact": referenced.model_dump() if referenced else None},
            )
            db.add(claim)
            await db.flush()
            for cited, source in evidence_records:
                db.add(ClaimEvidence(claim_id=claim.id, source_record_id=source.id, excerpt=cited.excerpt, resolved=label != "system_rejected"))
            if candidate.dependency_edge:
                db.add(Dependency(transition_id=transition_id, from_entity=candidate.dependency_edge.from_entity, to_entity=candidate.dependency_edge.to_entity, claim_id=claim.id))
            claims.append(claim)
            by_subject[subject].append(claim)
            rejected += label == "system_rejected"

    conflict_count = 0
    for subject_claims in by_subject.values():
        comparable = [claim for claim in subject_claims if claim.review_state != "system_rejected" and claim.status_value]
        by_status: dict[str, list[KnowledgeClaim]] = defaultdict(list)
        for claim in comparable:
            by_status[claim.status_value.casefold().strip()].append(claim)
        if len(by_status) > 1:
            conflict_count += 1
            for claim in comparable:
                claim.trust_label = "conflicting"
                claim.trust_reason = "Different status values were found for the same subject across source records."
            status_groups = list(by_status.values())
            for group_index, group in enumerate(status_groups):
                for other_group in status_groups[group_index + 1:]:
                    for left in group:
                        for right in other_group:
                            db.add(ConflictPair(transition_id=transition_id, claim_a_id=left.id, claim_b_id=right.id, reason="Differing status values for the same subject."))
        else:
            corroborated_claims = [claim for claim in comparable if claim.trust_label == "partially_supported"]
            source_ids: set[UUID] = set()
            for claim in corroborated_claims:
                evidence_ids = list((await db.scalars(select(ClaimEvidence.source_record_id).where(ClaimEvidence.claim_id == claim.id))).all())
                source_ids.update(evidence_ids)
            if len(source_ids) > 1:
                for claim in corroborated_claims:
                    claim.trust_label = "verified"
                    claim.trust_reason = "Matching status was supported by multiple source records."

    await db.flush()
    return {"records": len(records), "claims": len(claims), "systemRejected": rejected, "conflicts": conflict_count, "skipped": False}
