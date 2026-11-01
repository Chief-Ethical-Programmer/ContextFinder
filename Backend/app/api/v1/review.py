from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_role
from app.core.access import require_transition_access
from app.db.models import HandoverVersion, KnowledgeClaim, Transition, User
from app.db.session import get_db
from app.services.review import claim_payload, get_claim_or_404, publish_transition, review_claim

router = APIRouter(tags=["review"])
Reviewer = Annotated[User, Depends(require_role("admin"))]


async def reviewer_claim(db: AsyncSession, claim_id: UUID, user: User) -> KnowledgeClaim:
    claim = await get_claim_or_404(db, claim_id)
    transition = await db.get(Transition, claim.transition_id)
    if not transition:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Claim not found")
    await require_transition_access(db, user, transition, admin_only=True)
    return claim


async def reviewer_transition(db: AsyncSession, transition_id: UUID, user: User) -> Transition:
    transition = await db.get(Transition, transition_id)
    if not transition:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition, admin_only=True)
    return transition


@router.post("/claims/{claim_id}/approve")
async def approve(claim_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    claim = await review_claim(db, await reviewer_claim(db, claim_id, user), user.id, "approve")
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
    await reviewer_transition(db, transition_id, user)
    claim_ids = [UUID(value) for value in body.get("claimIds", [])]
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, KnowledgeClaim.id.in_(claim_ids)))).all())
    blocked = [str(claim.id) for claim in claims if claim.trust_label in {"conflicting", "missing_evidence"}]
    if blocked:
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail={"code": "bulk_blocked", "claimIds": blocked})
    approved = []
    for claim in claims:
        approved.append(await review_claim(db, claim, user.id, "approve"))
    await db.commit()
    return {"approved": [await claim_payload(db, claim) for claim in approved]}


@router.get("/transitions/{transition_id}/review-progress")
async def progress(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await reviewer_transition(db, transition_id, user)
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id))).all())
    return {"reviewed": sum(claim.review_state in {"approved", "edited", "rejected"} for claim in claims), "total": len(claims), "blocking": sum(claim.trust_label in {"conflicting", "missing_evidence"} and claim.review_state != "rejected" for claim in claims)}


@router.get("/transitions/{transition_id}/versions")
async def versions(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await reviewer_transition(db, transition_id, user)
    return list((await db.scalars(select(HandoverVersion).where(HandoverVersion.transition_id == transition_id).order_by(HandoverVersion.version))).all())


@router.post("/transitions/{transition_id}/publish")
async def publish(transition_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Reviewer):
    await reviewer_transition(db, transition_id, user)
    handover = await publish_transition(db, transition_id, user.id, str(body.get("remarks", "")), str(body.get("targetRecipientRole", "technical_successor")))
    await db.commit()
    return handover
