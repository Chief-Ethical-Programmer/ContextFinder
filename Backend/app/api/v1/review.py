from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_transition_access
from app.core.deps import current_user, require_role
from app.db.models import (
    AuditEvent,
    ClaimVersion,
    HandoverVersion,
    KnowledgeClaim,
    Transition,
    User,
)
from app.db.session import get_db
from app.services.claim_filters import reviewable_claim_filter
from app.services.review import claim_payload, get_claim_or_404, publish_transition, review_claim

router = APIRouter(tags=["review"])
Reviewer = Annotated[User, Depends(require_role("reviewer"))]


async def reviewer_claim(db: AsyncSession, claim_id: UUID, user: User) -> KnowledgeClaim:
    claim = await get_claim_or_404(db, claim_id)
    transition = await db.get(Transition, claim.transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Claim not found")
    if transition.reviewer_id != user.id:
        raise HTTPException(status_code=404, detail="Transition not found")
    if transition.status not in {"review", "awaiting_admin_approval"}:
        raise HTTPException(status_code=409, detail="This review has already been approved or is not open for review")
    return claim


async def reviewer_transition(db: AsyncSession, transition_id: UUID, user: User) -> Transition:
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    if transition.reviewer_id != user.id:
        raise HTTPException(status_code=404, detail="Transition not found")
    return transition


@router.post("/claims/{claim_id}/approve")
async def approve(claim_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await review_claim(db, await reviewer_claim(db, claim_id, user), user.id, "approve", str(body.get("note", "")))
    await db.commit()
    return await claim_payload(db, claim)


@router.post("/claims/{claim_id}/reject")
async def reject(claim_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await review_claim(db, await reviewer_claim(db, claim_id, user), user.id, "reject", str(body.get("note", "")))
    await db.commit()
    return await claim_payload(db, claim)


@router.post("/claims/{claim_id}/ask-more")
async def ask_more(claim_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await review_claim(db, await reviewer_claim(db, claim_id, user), user.id, "ask_more", str(body.get("note", "")))
    await db.commit()
    return await claim_payload(db, claim)


@router.post("/claims/{claim_id}/edit")
async def edit(claim_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await review_claim(
        db,
        await reviewer_claim(db, claim_id, user),
        user.id,
        "edit",
        str(body.get("note", "")),
        str(body.get("statement", "")),
        trust_label=body.get("trustLabel"),
        access_level=body.get("accessLevel"),
        origin=body.get("origin"),
        evidence_ids=body.get("evidenceIds"),
    )
    await db.commit()
    return await claim_payload(db, claim)


@router.post("/transitions/{transition_id}/claims/bulk-approve")
async def bulk_approve(transition_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    transition = await reviewer_transition(db, transition_id, user)
    if transition.status not in {"review", "awaiting_admin_approval"}:
        raise HTTPException(status_code=409, detail="This review has already been approved or is not open for review")
    claim_ids = [UUID(value) for value in body.get("claimIds", [])]
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, KnowledgeClaim.id.in_(claim_ids)))).all())
    blocked = [str(claim.id) for claim in claims if claim.trust_label in {"conflicting", "missing_evidence"}]
    if blocked:
        raise HTTPException(status_code=422, detail={"code": "bulk_blocked", "claimIds": blocked})
    approved = []
    for claim in claims:
        approved.append(await review_claim(db, claim, user.id, "approve"))
    await db.commit()
    return {"approved": [await claim_payload(db, claim) for claim in approved]}


@router.get("/transitions/{transition_id}/review-progress")
async def progress(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await reviewer_transition(db, transition_id, user)
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, reviewable_claim_filter()))).all())
    return {"reviewed": sum(claim.review_state in {"approved", "edited", "rejected"} for claim in claims), "total": len(claims), "blocking": sum(claim.trust_label in {"conflicting", "missing_evidence"} and claim.review_state != "rejected" for claim in claims)}


@router.get("/transitions/{transition_id}/versions")
async def versions(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    if user.role == "admin":
        await require_transition_access(db, user, transition, admin_only=True)
    elif user.role != "reviewer" or transition.reviewer_id != user.id:
        raise HTTPException(status_code=404, detail="Transition not found")
    return list((await db.scalars(select(HandoverVersion).where(HandoverVersion.transition_id == transition_id).order_by(HandoverVersion.version))).all())


@router.post("/transitions/{transition_id}/publish")
async def publish(transition_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await reviewer_transition(db, transition_id, user)
    transition = await db.get(Transition, transition_id)
    handover = await publish_transition(db, transition_id, user.id, str(body.get("remarks", "")), transition.target_recipient_role)
    await db.commit()
    return {"id": str(transition.id), "status": transition.status, "version": handover.version}


@router.post("/admin/transitions/{transition_id}/final-approval")
async def final_admin_approval(transition_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("admin"))]):
    raise HTTPException(status_code=409, detail="The assigned reviewer gives final handover approval. Admins assign an incoming member after that approval.")


@router.get("/transitions/{transition_id}/review-questions")
async def departing_review_questions(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition or user.role != "departing" or transition.departing_user_id != user.id:
        raise HTTPException(status_code=404, detail="Transition not found")
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, KnowledgeClaim.review_state == "needs_more").order_by(KnowledgeClaim.created_at))).all())
    return [{"claimId": str(claim.id), "statement": claim.statement, "question": str((claim.flags or {}).get("reviewerQuestion", ""))} for claim in claims]


@router.post("/claims/{claim_id}/departing-response")
async def respond_to_review_question(claim_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    claim = await db.get(KnowledgeClaim, claim_id)
    transition = await db.get(Transition, claim.transition_id) if claim else None
    if not claim or not transition or user.role != "departing" or transition.departing_user_id != user.id:
        raise HTTPException(status_code=404, detail="Review question not found")
    if transition.status not in {"review", "awaiting_reviewer_assignment", "awaiting_admin_approval"} or claim.review_state != "needs_more":
        raise HTTPException(status_code=409, detail="This claim is not waiting for a departing member response")
    response = str(body.get("response", "")).strip()
    if not response:
        raise HTTPException(status_code=422, detail="Enter a response before submitting")
    claim.flags = {**(claim.flags or {}), "departingResponse": response}
    claim.review_state = "proposed"
    claim.current_version += 1
    db.add(ClaimVersion(claim_id=claim.id, version=claim.current_version, statement=claim.statement, changed_by=user.id, change_kind="departing_response"))
    db.add(AuditEvent(actor_id=user.id, action="departing_response", entity_type="claim", entity_id=claim.id, transition_id=transition.id, detail={"response": response}))
    await db.commit()
    return {"claimId": str(claim.id), "status": claim.review_state}
