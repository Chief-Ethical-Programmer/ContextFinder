from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_transition_access
from app.core.deps import require_role
from app.db.models import (
    ClaimEvidence,
    ExitAnswer,
    ExitQuestion,
    KnowledgeClaim,
    SourceConnection,
    SourceRecord,
    Transition,
    User,
)
from app.db.session import get_db
from app.services.claim_filters import reviewable_claim_filter
from app.services.extraction import extract_and_verify

router = APIRouter(tags=["claims"])
Reviewer = Annotated[User, Depends(require_role("admin", "reviewer"))]


async def require_transition_reviewer(db: AsyncSession, transition_id: UUID, user: User) -> None:
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    if user.role == "admin":
        await require_transition_access(db, user, transition, admin_only=True)
    elif transition.reviewer_id != user.id:
        raise HTTPException(status_code=404, detail="Transition not found")


@router.post("/transitions/{transition_id}/extract")
async def extract_claims(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await require_transition_reviewer(db, transition_id, user)
    result = await extract_and_verify(db, transition_id)
    await db.commit()
    return {"transitionId": transition_id, **result}


@router.get("/transitions/{transition_id}/claims")
async def list_claims(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer, label: str | None = None, type: str | None = None):
    await require_transition_reviewer(db, transition_id, user)
    query = select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, reviewable_claim_filter()).order_by(KnowledgeClaim.trust_label, KnowledgeClaim.created_at)
    if label:
        query = query.where(KnowledgeClaim.trust_label == label)
    if type:
        query = query.where(KnowledgeClaim.type == type)
    claims = list((await db.scalars(query)).all())
    answers = list((await db.execute(
        select(ExitQuestion.id, ExitQuestion.claim_id, ExitAnswer.body, ExitAnswer.kind)
        .join(ExitAnswer, ExitAnswer.question_id == ExitQuestion.id)
        .where(ExitQuestion.transition_id == transition_id)
        .order_by(ExitAnswer.created_at.desc())
    )).all())
    response_by_claim: dict[UUID, str] = {}
    answer_by_question: dict[UUID, tuple[str | None, str]] = {}
    for question_id, claim_id, body, kind in answers:
        answer_by_question.setdefault(question_id, (body, kind))
        if claim_id not in response_by_claim and kind in {"answer", "dont_know"}:
            response_by_claim[claim_id] = "I don't know." if kind == "dont_know" else str(body or "")
    exit_questions = list((await db.scalars(
        select(ExitQuestion).where(ExitQuestion.transition_id == transition_id).order_by(ExitQuestion.id)
    )).all())
    followups_by_claim: dict[UUID, list[dict[str, str | None]]] = {}
    for question in exit_questions:
        body, kind = answer_by_question.get(question.id, (None, ""))
        status = "Answered" if question.status == "answered" and kind in {"answer", "dont_know"} else "Skipped" if question.status == "skipped" or kind == "skipped" else "Draft saved" if kind == "draft" else "Awaiting answer"
        answer_text = "I don't know." if kind == "dont_know" and status == "Answered" else str(body or "") if status == "Answered" else None
        followups_by_claim.setdefault(question.claim_id, []).append({
            "source": "Gemini",
            "question": question.prompt,
            "answer": answer_text,
            "status": status,
        })
    evidence_rows = list((await db.scalars(
        select(ClaimEvidence).where(ClaimEvidence.claim_id.in_([claim.id for claim in claims]))
    )).all()) if claims else []
    evidence_by_claim: dict[UUID, list[str]] = {}
    for evidence in evidence_rows:
        evidence_by_claim.setdefault(evidence.claim_id, []).append(str(evidence.id))
    items = [{
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
        "flags": {
            **(claim.flags or {}),
            **({"departingResponse": response_by_claim[claim.id]} if response_by_claim.get(claim.id) and not (claim.flags or {}).get("departingResponse") else {}),
        },
        "followUps": followups_by_claim.get(claim.id, []) + ([{
            "source": "Reviewer",
            "question": str((claim.flags or {}).get("reviewerQuestion", "")),
            "answer": str((claim.flags or {}).get("departingResponse", "")) or None,
            "status": "Answered" if (claim.flags or {}).get("departingResponse") else "Awaiting answer",
        }] if (claim.flags or {}).get("reviewerQuestion") else []),
        "evidenceIds": evidence_by_claim.get(claim.id, []),
    } for claim in claims]
    return {"items": items, "total": len(items)}


@router.get("/transitions/{transition_id}/review-evidence")
async def review_evidence(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await require_transition_reviewer(db, transition_id, user)
    rows = list((await db.execute(
        select(ClaimEvidence, SourceRecord, SourceConnection)
        .join(KnowledgeClaim, ClaimEvidence.claim_id == KnowledgeClaim.id)
        .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
        .join(SourceConnection, SourceRecord.connection_id == SourceConnection.id)
        .where(KnowledgeClaim.transition_id == transition_id, reviewable_claim_filter())
        .order_by(SourceRecord.occurred_at, SourceRecord.id)
    )).all())
    source_names = {"github": "GitHub", "slack_export": "Slack", "slack_leads_export": "Slack", "drive_export": "Drive", "meeting_notes": "Meeting notes"}
    return [{
        "id": str(item.id), "claimId": str(item.claim_id), "sourceRecordId": str(source.id),
        "source": source_names.get(connection.kind, connection.kind), "author": source.author,
        "happenedAt": source.occurred_at, "excerpt": item.excerpt, "href": source.url,
    } for item, source, connection in rows]


@router.get("/claims/{claim_id}")
async def get_claim(claim_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await db.get(KnowledgeClaim, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    await require_transition_reviewer(db, claim.transition_id, user)
    evidence = list((await db.scalars(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim_id))).all())
    return {"claim": claim, "evidence": evidence}
