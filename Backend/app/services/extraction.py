from collections import defaultdict
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ClaimEvidence,
    ConflictPair,
    Dependency,
    KnowledgeClaim,
    SourceConnection,
    SourceRecord,
)
from app.llm.provider import get_llm_client
from app.llm.schemas import CandidateEvidence, ChunkInput
from app.verify.rules import EvidenceCheck, inherited_access, is_future, label_single_claim


async def extract_and_verify(db: AsyncSession, transition_id: UUID) -> dict:
    existing = await db.scalar(select(KnowledgeClaim.id).where(KnowledgeClaim.transition_id == transition_id).limit(1))
    if existing:
        return {"records": 0, "claims": 0, "systemRejected": 0, "conflicts": 0, "skipped": True}
    records = list((await db.scalars(select(SourceRecord).join(SourceConnection).where(SourceConnection.transition_id == transition_id).order_by(SourceRecord.occurred_at))).all())
    client = get_llm_client()
    claims: list[KnowledgeClaim] = []
    by_subject: dict[str, list[KnowledgeClaim]] = defaultdict(list)
    rejected = 0
    for record in records:
        candidates = await client.extract_claims(ChunkInput(source_record_id=record.id, text=record.text, kind=record.kind, author=record.author))
        for candidate in candidates:
            evidence_checks: list[EvidenceCheck] = []
            evidence_records: list[tuple[CandidateEvidence, SourceRecord]] = []
            for evidence in candidate.evidence:
                source = next((item for item in records if item.id == evidence.source_record_id), None)
                if source is None:
                    evidence_checks.append(EvidenceCheck(False, False))
                    continue
                evidence_records.append((evidence, source))
                evidence_checks.append(EvidenceCheck(True, " ".join(evidence.excerpt.split()).casefold() in " ".join(source.text.split()).casefold(), is_future(source.occurred_at)))
            label, reason = label_single_claim(evidence_checks=evidence_checks, artifact_missing=bool(candidate.referenced_artifact and not candidate.referenced_artifact.resolved), corroborated=False)
            claim = KnowledgeClaim(transition_id=transition_id, type=candidate.type, statement=candidate.statement, subject_key=candidate.subject_key, status_value=candidate.status_value, trust_label=label, trust_reason=reason, access_level=inherited_access([record.access_level for _, record in evidence_records] or ["public_team"]), origin="system", review_state="system_rejected" if label == "system_rejected" else "proposed", current_version=1, occurred_at=candidate.occurred_at, flags={"referencedArtifact": candidate.referenced_artifact.model_dump() if candidate.referenced_artifact else None})
            db.add(claim)
            await db.flush()
            for evidence, source in evidence_records:
                db.add(ClaimEvidence(claim_id=claim.id, source_record_id=source.id, excerpt=evidence.excerpt, resolved=label != "system_rejected"))
            if candidate.dependency_edge:
                db.add(Dependency(transition_id=transition_id, from_entity=candidate.dependency_edge.from_entity, to_entity=candidate.dependency_edge.to_entity, claim_id=claim.id))
            claims.append(claim)
            by_subject[claim.subject_key].append(claim)
            rejected += label == "system_rejected"
    for subject_claims in by_subject.values():
        statuses = {claim.status_value for claim in subject_claims if claim.status_value}
        if len(statuses) > 1:
            for index, claim in enumerate(subject_claims):
                if claim.status_value and claim.review_state != "system_rejected":
                    claim.trust_label = "conflicting"
                    claim.trust_reason = "Different status values were found for the same subject across sources."
                    for other in subject_claims[index + 1:]:
                        if other.status_value and other.status_value != claim.status_value:
                            db.add(ConflictPair(transition_id=transition_id, claim_a_id=claim.id, claim_b_id=other.id, reason="Differing status values for the same subject."))
    for subject_claims in by_subject.values():
        valid = [claim for claim in subject_claims if claim.review_state != "system_rejected"]
        if len(valid) >= 2 and len({claim.status_value for claim in valid}) == 1:
            for claim in valid:
                claim.trust_label = "verified"
                claim.trust_reason = "Corroborated by multiple source records."
    await db.flush()
    return {"records": len(records), "claims": len(claims), "systemRejected": rejected, "conflicts": sum(1 for claims_for_subject in by_subject.values() if len({claim.status_value for claim in claims_for_subject if claim.status_value}) > 1)}
