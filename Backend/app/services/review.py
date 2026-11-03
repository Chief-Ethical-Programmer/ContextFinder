from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clearance import AccessLevel, strictest_access
from app.db.models import (
    AuditEvent,
    ClaimEvidence,
    ClaimVersion,
    ExitAnswer,
    ExitQuestion,
    HandoverVersion,
    KnowledgeClaim,
    ProjectRequest,
    ReviewEvent,
    RoleView,
    SourceConnection,
    SourceRecord,
    Transition,
)
from app.services.claim_filters import reviewable_claim_filter

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
    flags = dict(claim.flags or {})
    if not flags.get("departingResponse"):
        answer = await db.scalar(
            select(ExitAnswer)
            .join(ExitQuestion, ExitQuestion.id == ExitAnswer.question_id)
            .where(ExitQuestion.claim_id == claim.id, ExitAnswer.kind.in_({"answer", "dont_know"}))
            .order_by(ExitAnswer.created_at.desc())
            .limit(1)
        )
        if answer:
            flags["departingResponse"] = "I don't know." if answer.kind == "dont_know" else answer.body
    exit_questions = list((await db.scalars(
        select(ExitQuestion).where(ExitQuestion.claim_id == claim.id).order_by(ExitQuestion.id)
    )).all())
    answer_rows = list((await db.execute(
        select(ExitAnswer.question_id, ExitAnswer.body, ExitAnswer.kind)
        .join(ExitQuestion, ExitQuestion.id == ExitAnswer.question_id)
        .where(ExitQuestion.claim_id == claim.id)
        .order_by(ExitAnswer.created_at.desc())
    )).all())
    answer_by_question: dict[UUID, tuple[str, str]] = {}
    for question_id, body, kind in answer_rows:
        answer_by_question.setdefault(question_id, (body or "", kind))
    follow_ups = []
    for question in exit_questions:
        body, kind = answer_by_question.get(question.id, ("", ""))
        status = "Answered" if question.status == "answered" and kind in {"answer", "dont_know"} else "Skipped" if question.status == "skipped" or kind == "skipped" else "Draft saved" if kind == "draft" else "Awaiting answer"
        answer_text = "I don't know." if kind == "dont_know" and status == "Answered" else body if status == "Answered" else None
        follow_ups.append({"source": "Gemini", "question": question.prompt, "answer": answer_text, "status": status})
    if flags.get("reviewerQuestion"):
        follow_ups.append({
            "source": "Reviewer",
            "question": str(flags["reviewerQuestion"]),
            "answer": str(flags.get("departingResponse") or "") or None,
            "status": "Answered" if flags.get("departingResponse") else "Awaiting answer",
        })
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
        "flags": flags,
        "followUps": follow_ups,
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
        if claim.trust_label in BLOCKING_LABELS and not note.strip():
            raise HTTPException(status_code=422, detail="Add a human review note to approve a claim flagged for conflict or missing evidence")
        claim.review_state = "approved"
    elif action == "reject":
        claim.review_state = "rejected"
    elif action == "ask_more":
        if not note.strip():
            raise HTTPException(status_code=422, detail="Add a specific question for the departing member")
        claim.review_state = "needs_more"
        claim.flags = {**(claim.flags or {}), "reviewerQuestion": note.strip(), "departingResponse": ""}
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


async def review_ready_claims(db: AsyncSession, transition_id: UUID) -> list[KnowledgeClaim]:
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, reviewable_claim_filter()))).all())
    blocking = [claim.id for claim in claims if claim.trust_label in BLOCKING_LABELS and claim.review_state not in {"approved", "rejected"}]
    if blocking:
        raise HTTPException(status_code=409, detail={"code": "blocking_claims", "claimIds": blocking})
    if any(claim.review_state not in {"approved", "edited", "rejected"} for claim in claims):
        raise HTTPException(status_code=409, detail="Every claim must be approved, edited, or rejected before submission")
    if not claims:
        raise HTTPException(status_code=409, detail="There are no claims to submit for approval")
    return claims


async def publish_transition(db: AsyncSession, transition_id: UUID, reviewer_id: UUID, remarks: str, role: str) -> HandoverVersion:
    transition = await db.get(Transition, transition_id)
    if not transition or transition.reviewer_id != reviewer_id:
        raise HTTPException(status_code=404, detail="Transition not found")
    if transition.status not in {"review", "awaiting_admin_approval"}:
        raise HTTPException(status_code=409, detail="This handover is not currently open for reviewer approval")
    if role not in {"project_lead", "technical_successor", "new_volunteer"}:
        raise HTTPException(status_code=422, detail="Unsupported handover recipient role")
    claims = await review_ready_claims(db, transition_id)
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
        db.add(RoleView(handover_version_id=handover.id, recipient_role=recipient_role, summary=f"{len(visible)} approved claims available for {recipient_role.replace('_', ' ')}.", generation_mode="template", claim_ids=[str(claim.id) for claim in visible]))
    db.add(AuditEvent(actor_id=reviewer_id, action="reviewer_final_approval", entity_type="handover", transition_id=transition_id, detail={"version": version, "remarks": remarks}))
    transition.status = "published"
    if transition.incoming_user_id and not transition.incoming_access_expires_at:
        transition.incoming_access_expires_at = datetime.now(UTC) + timedelta(days=30)
        db.add(AuditEvent(actor_id=reviewer_id, action="incoming_access_granted", entity_type="transition", entity_id=transition.id, transition_id=transition.id, detail={"incoming_user_id": str(transition.incoming_user_id), "expires_at": transition.incoming_access_expires_at.isoformat(), "access_days": 30}))
    project_request = await db.scalar(select(ProjectRequest).where(ProjectRequest.transition_id == transition_id))
    if project_request:
        project_request.status = "approved"
        project_request.reviewed_by = reviewer_id
        project_request.reviewer_note = remarks
        project_request.reviewed_at = datetime.now(UTC)
    await db.flush()
    return handover
