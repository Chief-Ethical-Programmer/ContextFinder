from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.clearance import RecipientRole, may_see
from app.db.models import (
    AccessRequest,
    Acknowledgement,
    AuditEvent,
    HandoverVersion,
    Transition,
    User,
)


def recipient_role_for(user: User, transition: Transition) -> RecipientRole:
    if user.role == "admin":
        return RecipientRole.PROJECT_LEAD
    if user.id == transition.incoming_user_id:
        return RecipientRole(transition.target_recipient_role)
    if user.id == transition.departing_user_id:
        return RecipientRole.TECHNICAL_SUCCESSOR
    raise HTTPException(status_code=404, detail="Handover not found")


def filtered_claims(snapshot: dict, role: RecipientRole) -> tuple[list[dict], int]:
    visible = [claim for claim in snapshot.get("claims", []) if may_see(role, claim["accessLevel"])]
    return visible, len(snapshot.get("claims", [])) - len(visible)


async def latest_handover(db: AsyncSession, transition_id: UUID) -> HandoverVersion:
    handover = await db.scalar(select(HandoverVersion).where(HandoverVersion.transition_id == transition_id).order_by(HandoverVersion.version.desc()))
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    return handover


async def create_access_request(db: AsyncSession, handover: HandoverVersion, user: User, note: str) -> AccessRequest:
    request = AccessRequest(handover_version_id=handover.id, user_id=user.id, note=note)
    db.add(request)
    db.add(AuditEvent(actor_id=user.id, action="access_request", entity_type="handover", entity_id=handover.id, transition_id=handover.transition_id, detail={"note": note}))
    await db.flush()
    return request


async def acknowledge(db: AsyncSession, handover: HandoverVersion, user: User) -> Acknowledgement:
    existing = await db.scalar(select(Acknowledgement).where(Acknowledgement.handover_version_id == handover.id, Acknowledgement.user_id == user.id))
    if existing:
        return existing
    acknowledgement = Acknowledgement(handover_version_id=handover.id, user_id=user.id)
    db.add(acknowledgement)
    db.add(AuditEvent(actor_id=user.id, action="acknowledge", entity_type="handover", entity_id=handover.id, transition_id=handover.transition_id, detail={"version": handover.version}))
    await db.flush()
    return acknowledgement
