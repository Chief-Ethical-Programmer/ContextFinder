from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.core.access import require_transition_access
from app.db.models import ClaimEvidence, KnowledgeClaim, Transition, User
from app.db.session import get_db
from app.services.extraction import extract_and_verify

router = APIRouter(tags=["claims"])
Reviewer = Annotated[User, Depends(require_role("admin"))]


async def require_transition_reviewer(db: AsyncSession, transition_id: UUID, user: User) -> None:
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition, admin_only=True)


@router.post("/transitions/{transition_id}/extract")
async def extract_claims(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await require_transition_reviewer(db, transition_id, user)
    result = await extract_and_verify(db, transition_id)
    await db.commit()
    return {"transitionId": transition_id, **result}


@router.get("/transitions/{transition_id}/claims")
async def list_claims(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer, label: str | None = None, type: str | None = None):
    await require_transition_reviewer(db, transition_id, user)
    query = select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id).order_by(KnowledgeClaim.trust_label, KnowledgeClaim.created_at)
    if label:
        query = query.where(KnowledgeClaim.trust_label == label)
    if type:
        query = query.where(KnowledgeClaim.type == type)
    claims = list((await db.scalars(query)).all())
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
        "flags": claim.flags,
        "evidenceIds": evidence_by_claim.get(claim.id, []),
    } for claim in claims]
    return {"items": items, "total": len(items)}


@router.get("/claims/{claim_id}")
async def get_claim(claim_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await db.get(KnowledgeClaim, claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    await require_transition_reviewer(db, claim.transition_id, user)
    evidence = list((await db.scalars(select(ClaimEvidence).where(ClaimEvidence.claim_id == claim_id))).all())
    return {"claim": claim, "evidence": evidence}
