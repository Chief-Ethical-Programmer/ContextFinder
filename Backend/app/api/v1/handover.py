from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clearance import RecipientRole, may_see
from app.core.deps import current_user
from app.core.access import require_transition_access
from app.db.models import Acknowledgement, ClaimEvidence, KnowledgeClaim, RoleView, SourceConnection, SourceRecord, Transition, User
from app.db.session import get_db
from app.services.handover import (
    acknowledge,
    create_access_request,
    filtered_claims,
    latest_handover,
    recipient_role_for,
)

router = APIRouter(tags=["handover"])


async def transition_or_404(db: AsyncSession, transition_id: UUID) -> Transition:
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Handover not found")
    return transition


@router.get("/handover/{transition_id}")
async def handover(
    transition_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(current_user)],
    requested_role: str | None = Query(default=None, alias="role"),
):
    transition = await transition_or_404(db, transition_id)
    await require_transition_access(db, user, transition)
    if transition.status not in {"published", "acknowledged"} and user.role != "admin":
        raise HTTPException(status_code=404, detail="Handover not found")
    version = await latest_handover(db, transition_id)
    role = recipient_role_for(user, transition)
    if requested_role:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can preview another recipient role")
        try:
            role = RecipientRole(requested_role)
        except ValueError:
            raise HTTPException(status_code=422, detail="Unsupported recipient role")
    claims, hidden_count = filtered_claims(version.snapshot, role)
    role_view = await db.scalar(select(RoleView).where(RoleView.handover_version_id == version.id, RoleView.recipient_role == role.value))
    acknowledgement = await db.scalar(select(Acknowledgement).where(Acknowledgement.handover_version_id == version.id, Acknowledgement.user_id == transition.incoming_user_id))
    acknowledged_by = await db.get(User, acknowledgement.user_id) if acknowledgement else None
    return {"transitionId": transition_id, "version": version.version, "role": role.value, "canPreviewRoles": user.role == "admin", "summary": role_view.summary if role_view else "", "plan30_60_90": role_view.plan_30_60_90 if role_view else {}, "claims": claims, "hiddenCount": hidden_count, "remarks": version.remarks, "acknowledgedAt": acknowledgement.acknowledged_at if acknowledgement else None, "acknowledgedBy": acknowledged_by.name if acknowledged_by else None, "acknowledgedVersion": version.version if acknowledgement else None}


@router.get("/handover/{transition_id}/plan")
async def plan(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    response = await handover(transition_id, db, user, None)
    return {"transitionId": transition_id, "role": response["role"], "plan30_60_90": response["plan30_60_90"]}


@router.get("/claims/{claim_id}/evidence")
async def evidence(claim_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    claim = await db.get(KnowledgeClaim, claim_id)
    transition = await transition_or_404(db, claim.transition_id) if claim else None
    if not claim:
        raise HTTPException(status_code=404, detail="Evidence not found")
    await require_transition_access(db, user, transition)
    role = recipient_role_for(user, transition)
    if user.role == "incoming":
        if transition.status not in {"published", "acknowledged"} or claim.review_state not in {"approved", "edited"} or not may_see(role, claim.access_level):
            raise HTTPException(status_code=404, detail="Evidence not found")
        version = await latest_handover(db, transition.id)
        published_ids = {item.get("id") for item in version.snapshot.get("claims", [])}
        if str(claim.id) not in published_ids:
            raise HTTPException(status_code=404, detail="Evidence not found")
    elif user.role != "admin" and not may_see(role, claim.access_level):
        raise HTTPException(status_code=404, detail="Evidence not found")
    rows = list((await db.execute(
        select(ClaimEvidence, SourceRecord, SourceConnection)
        .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
        .join(SourceConnection, SourceRecord.connection_id == SourceConnection.id)
        .where(ClaimEvidence.claim_id == claim_id)
    )).all())
    source_names = {"github": "GitHub", "slack_export": "Slack", "slack_leads_export": "Slack", "drive_export": "Drive", "meeting_notes": "Meeting notes"}
    evidence_items = [{
        "id": str(item.id),
        "sourceRecordId": str(source.id),
        "source": source_names.get(connection.kind, connection.kind),
        "author": source.author,
        "happenedAt": source.occurred_at,
        "excerpt": item.excerpt,
        "url": source.url,
    } for item, source, connection in rows if user.role == "admin" or may_see(role, source.access_level)]
    return {"claimId": claim_id, "evidence": evidence_items}


@router.post("/handover/{transition_id}/acknowledge")
async def acknowledge_handover(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await transition_or_404(db, transition_id)
    if user.role != "incoming" or transition.incoming_user_id != user.id:
        raise HTTPException(status_code=404, detail="Handover not found")
    version = await latest_handover(db, transition_id)
    result = await acknowledge(db, version, user)
    transition.status = "acknowledged"
    await db.commit()
    return {
        "transitionId": transition.id,
        "status": transition.status,
        "acknowledgedAt": result.acknowledged_at,
        "acknowledgedBy": user.name,
        "acknowledgedVersion": version.version,
    }


@router.post("/handover/{transition_id}/access-requests")
async def request_access(transition_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await transition_or_404(db, transition_id)
    await require_transition_access(db, user, transition)
    recipient_role_for(user, transition)
    version = await latest_handover(db, transition_id)
    result = await create_access_request(db, version, user, str(body.get("note", "")))
    await db.commit()
    return result
