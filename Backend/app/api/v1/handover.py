import math
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_transition_access
from app.core.clearance import RecipientRole, may_see
from app.core.deps import current_user
from app.db.models import (
    Acknowledgement,
    ClaimEvidence,
    KnowledgeClaim,
    Project,
    RoleView,
    SourceConnection,
    SourceRecord,
    Transition,
    User,
)
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
    project = await db.get(Project, transition.project_id)
    departing = await db.get(User, transition.departing_user_id)
    incoming = await db.get(User, transition.incoming_user_id) if transition.incoming_user_id else None
    connections = list((await db.scalars(select(SourceConnection).where(SourceConnection.transition_id == transition_id))).all())
    source_names = {"github": "GitHub", "slack_export": "Slack", "slack_leads_export": "Slack", "drive_export": "Drive", "meeting_notes": "Meeting notes"}
    source_rows = []
    for connection in connections:
        if may_see(role, connection.access_level):
            count = await db.scalar(select(func.count(SourceRecord.id)).where(SourceRecord.connection_id == connection.id))
            linked = await db.scalar(select(func.count(ClaimEvidence.id)).join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id).where(SourceRecord.connection_id == connection.id))
            repository_url = (connection.config or {}).get("repository") if connection.kind == "github" else None
            href = repository_url if isinstance(repository_url, str) and repository_url.startswith("https://github.com/") else None
            records = list((await db.scalars(select(SourceRecord).where(SourceRecord.connection_id == connection.id))).all())
            files = []
            for record in records:
                if not may_see(role, record.access_level):
                    continue
                metadata = record.metadata_json or {}
                file_path = metadata.get("relative_path") or metadata.get("path") or metadata.get("filename") or record.author or record.external_id
                file_name = PurePosixPath(str(file_path).replace("\\", "/")).name
                files.append({"recordId": str(record.id), "name": file_name, "href": record.url if isinstance(record.url, str) and record.url.startswith("https://") else None, "claimIds": []})
            source_rows.append({"id": str(connection.id), "transitionId": str(transition_id), "kind": connection.kind, "name": source_names.get(connection.kind, connection.kind), "access": connection.access_level, "connected": connection.status == "imported", "recordCount": count or 0, "linkedClaimCount": linked or 0, "href": href, "files": files})
    visible_claim_ids = [UUID(str(claim["id"])) for claim in claims if claim.get("id")]
    evidence_rows = list((await db.execute(
        select(ClaimEvidence, SourceRecord, SourceConnection, KnowledgeClaim)
        .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
        .join(SourceConnection, SourceRecord.connection_id == SourceConnection.id)
        .join(KnowledgeClaim, ClaimEvidence.claim_id == KnowledgeClaim.id)
        .where(ClaimEvidence.claim_id.in_(visible_claim_ids))
    )).all()) if visible_claim_ids else []
    evidence_items = []
    for item, source, connection, claim in evidence_rows:
        if not may_see(role, source.access_level):
            continue
        metadata = source.metadata_json or {}
        file_path = metadata.get("relative_path") or metadata.get("path") or metadata.get("filename") or source.author or source.external_id
        file_name = PurePosixPath(str(file_path).replace("\\", "/")).name
        evidence_items.append({"id": str(item.id), "claimId": str(claim.id), "source": source_names.get(connection.kind, connection.kind), "author": source.author, "fileName": file_name, "happenedAt": source.occurred_at, "excerpt": item.excerpt, "href": source.url})
        source_row = next((row for row in source_rows if row["id"] == str(connection.id)), None)
        if source_row:
            file_row = next((file for file in source_row["files"] if file["recordId"] == str(source.id)), None)
            if file_row and str(claim.id) not in file_row["claimIds"]:
                file_row["claimIds"].append(str(claim.id))
    role_view = await db.scalar(select(RoleView).where(RoleView.handover_version_id == version.id, RoleView.recipient_role == role.value))
    acknowledgement = await db.scalar(select(Acknowledgement).where(Acknowledgement.handover_version_id == version.id, Acknowledgement.user_id == transition.incoming_user_id))
    acknowledged_by = await db.get(User, acknowledgement.user_id) if acknowledgement else None
    remarks = None if role == RecipientRole.NEW_VOLUNTEER else version.remarks
    access_seconds = (transition.incoming_access_expires_at - datetime.now(UTC)).total_seconds() if transition.incoming_access_expires_at else 0
    access_days = max(0, math.ceil(access_seconds / 86_400))
    return {"transitionId": transition_id, "transition": {"id": str(transition.id), "project": project.name if project else "Project", "projectCode": project.name[:2].upper() if project else "PR", "status": "Approved", "departing": {"id": str(departing.id), "name": departing.name, "email": departing.email, "title": "Departing member", "initials": "".join(part[0] for part in departing.name.split()[:2]).upper()} if departing else {}, "incoming": {"id": str(incoming.id), "name": incoming.name, "email": incoming.email, "title": "Incoming member", "initials": "".join(part[0] for part in incoming.name.split()[:2]).upper()} if incoming else {}, "incomingRole": transition.target_recipient_role.replace("_", " ").title(), "accessDaysRemaining": access_days, "accessExpiresAt": transition.incoming_access_expires_at, "accessReady": access_days > 0, "teamAssigned": True, "claimCount": len(version.snapshot.get("claims", [])), "reviewedCount": len(version.snapshot.get("claims", [])), "blockingCount": 0, "version": version.version, "publishedAt": version.published_at.isoformat()}, "version": version.version, "role": role.value, "canPreviewRoles": user.role == "admin", "summary": role_view.summary if role_view else "", "claims": claims, "evidence": evidence_items, "sources": source_rows, "hiddenCount": hidden_count, "remarks": remarks, "acknowledgedAt": acknowledgement.acknowledged_at if acknowledgement else None, "acknowledgedBy": acknowledged_by.name if acknowledged_by else None, "acknowledgedVersion": version.version if acknowledgement else None}


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
    await require_transition_access(db, user, transition)
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
