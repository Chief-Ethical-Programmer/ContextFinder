from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clearance import AccessLevel, strictest_access
from app.db.models import (
    AuditEvent,
    ClaimEvidence,
    ClaimVersion,
    HandoverVersion,
    KnowledgeClaim,
    ReviewEvent,
    RoleView,
    SourceConnection,
    SourceRecord,
    Transition,
)

BLOCKING_LABELS = {"conflicting", "missing_evidence"}


async def get_claim_or_404(db: AsyncSession, claim_id: UUID) -> KnowledgeClaim:
    claim = await db.get(KnowledgeClaim, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return claim


async def claim_payload(db: AsyncSession, claim: KnowledgeClaim) -> dict:
    evidence_ids = list((await db.scalars(
        select(ClaimEvidence.id).where(ClaimEvidence.claim_id == claim.id)
    )).all())
    return {
        "id": claim.id,
        "transition_id": claim.transition_id,
        "type": claim.type,
        "statement": claim.statement,
        "subject_key": claim.subject_key,
        "status_value": claim.status_value,
        "trust_label": claim.trust_label,
        "trust_reason": claim.trust_reason,
        "access_level": claim.access_level,
        "origin": claim.origin,
        "review_state": claim.review_state,
        "current_version": claim.current_version,
        "occurred_at": claim.occurred_at,
        "flags": claim.flags,
        "evidenceIds": [str(value) for value in evidence_ids],
    }


async def review_claim(
    db: AsyncSession,
    claim: KnowledgeClaim,
    reviewer_id: UUID,
    action: str,
    note: str = "",
    statement: str | None = None,
    *,
    trust_label: str | None = None,
    access_level: str | None = None,
    origin: str | None = None,
    evidence_ids: list[str] | None = None,
) -> KnowledgeClaim:
    if action == "approve":
        if claim.trust_label in BLOCKING_LABELS:
            raise HTTPException(status_code=422, detail="Blocking claims require individual resolution before approval")
        claim.review_state = "approved"
    elif action == "reject":
        claim.review_state = "rejected"
    elif action == "ask_more":
        claim.review_state = "needs_more"
    elif action == "edit":
        if not statement or not statement.strip():
            raise HTTPException(status_code=422, detail="Edited statement is required")
        if trust_label is not None and trust_label not in {"verified", "partially_supported", "conflicting", "unverified", "missing_evidence"}:
            raise HTTPException(status_code=422, detail="Unsupported trust label")
        if origin is not None and origin not in {"system", "leaver", "reviewer"}:
            raise HTTPException(status_code=422, detail="Unsupported claim origin")
        if access_level is not None and access_level not in {level.value for level in AccessLevel}:
            raise HTTPException(status_code=422, detail="Unsupported access level")
        selected_evidence: list[tuple[ClaimEvidence, SourceRecord, SourceConnection]] | None = None
        if evidence_ids is not None:
            try:
                ids = [UUID(value) for value in evidence_ids]
            except (TypeError, ValueError):
                raise HTTPException(status_code=422, detail="Invalid evidence reference")
            rows = list((await db.execute(
                select(ClaimEvidence, SourceRecord, SourceConnection)
                .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
                .join(SourceConnection, SourceRecord.connection_id == SourceConnection.id)
                .where(ClaimEvidence.id.in_(ids), SourceConnection.transition_id == claim.transition_id)
            )).all()) if ids else []
            if len(rows) != len(set(ids)):
                raise HTTPException(status_code=422, detail="Evidence must belong to this transition")
            selected_evidence = rows
            await db.execute(delete(ClaimEvidence).where(ClaimEvidence.claim_id == claim.id))
            for evidence, source, _ in rows:
                db.add(ClaimEvidence(claim_id=claim.id, source_record_id=source.id, excerpt=evidence.excerpt, resolved=evidence.resolved, note=evidence.note))
            if rows:
                inherited = strictest_access([AccessLevel(connection.access_level) for _, _, connection in rows]).value
                claim.access_level = strictest_access([AccessLevel(inherited), AccessLevel(access_level or inherited)]).value
            elif access_level is not None:
                claim.access_level = access_level
        if claim.trust_label in BLOCKING_LABELS and trust_label is not None and trust_label not in BLOCKING_LABELS and not note.strip():
            raise HTTPException(status_code=422, detail="A reviewer note is required to resolve a blocking label")
        if claim.trust_label in {"verified", "partially_supported"}:
            evidence_count = len(selected_evidence) if selected_evidence is not None else await db.scalar(
                select(func.count(ClaimEvidence.id)).where(ClaimEvidence.claim_id == claim.id)
            )
            if not evidence_count:
                raise HTTPException(status_code=422, detail="Supported claims must retain at least one evidence record")
        claim.statement = statement.strip()
        if trust_label is not None:
            claim.trust_label = trust_label
        if origin is not None:
            claim.origin = origin
        if access_level is not None and selected_evidence is None:
            claim.access_level = access_level
        claim.review_state = "edited"
        claim.current_version += 1
        db.add(ClaimVersion(claim_id=claim.id, version=claim.current_version, statement=claim.statement, changed_by=reviewer_id, change_kind="edit"))
    else:
        raise HTTPException(status_code=422, detail="Unsupported review action")
    db.add(ReviewEvent(claim_id=claim.id, reviewer_id=reviewer_id, action=action, note=note, version=claim.current_version))
    db.add(AuditEvent(actor_id=reviewer_id, action=action, entity_type="claim", entity_id=claim.id, transition_id=claim.transition_id, detail={"note": note}))
    await db.flush()
    return claim


async def publish_transition(db: AsyncSession, transition_id: UUID, reviewer_id: UUID, remarks: str, role: str) -> HandoverVersion:
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id))).all())
    blocking = [claim.id for claim in claims if claim.trust_label in BLOCKING_LABELS and claim.review_state != "rejected"]
    if blocking:
        raise HTTPException(status_code=409, detail={"code": "blocking_claims", "claimIds": blocking})
    if any(claim.review_state not in {"approved", "edited", "rejected"} for claim in claims):
        raise HTTPException(status_code=409, detail="All published claims must be approved or edited")
    publishable = [claim for claim in claims if claim.review_state in {"approved", "edited"}]
    latest = await db.scalar(select(func.max(HandoverVersion.version)).where(HandoverVersion.transition_id == transition_id))
    version = (latest or 0) + 1
    evidence_rows = list((await db.scalars(
        select(ClaimEvidence).where(ClaimEvidence.claim_id.in_([claim.id for claim in publishable]))
    )).all()) if publishable else []
    evidence_by_claim: dict[UUID, list[str]] = {}
    for evidence in evidence_rows:
        evidence_by_claim.setdefault(evidence.claim_id, []).append(str(evidence.id))
    snapshot = {"claims": [{"id": str(claim.id), "statement": claim.statement, "type": claim.type, "accessLevel": claim.access_level, "trustLabel": claim.trust_label, "evidenceIds": evidence_by_claim.get(claim.id, [])} for claim in publishable]}
    handover = HandoverVersion(transition_id=transition_id, version=version, published_by=reviewer_id, remarks=remarks, target_recipient_role=role, snapshot=snapshot)
    db.add(handover)
    await db.flush()
    for recipient_role, allowed in (("project_lead", {"public_team", "technical_only", "leads_only"}), ("technical_successor", {"public_team", "technical_only"}), ("new_volunteer", {"public_team"})):
        visible = [claim for claim in publishable if claim.access_level in allowed]
        db.add(RoleView(handover_version_id=handover.id, recipient_role=recipient_role, summary=f"{len(visible)} approved claims available for {recipient_role.replace('_', ' ')}.", plan_30_60_90={"30": [], "60": [], "90": []}, generation_mode="template", claim_ids=[str(claim.id) for claim in visible]))
    db.add(AuditEvent(actor_id=reviewer_id, action="publish", entity_type="handover", transition_id=transition_id, detail={"version": version}))
    transition = await db.get(Transition, transition_id)
    if transition:
        transition.status = "published"
    await db.flush()
    return handover
