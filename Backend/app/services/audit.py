from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent


async def write_audit(
    db: AsyncSession,
    *,
    action: str,
    entity_type: str,
    actor_id: UUID | None = None,
    entity_id: UUID | None = None,
    transition_id: UUID | None = None,
    detail: dict | None = None,
) -> AuditEvent:
    event = AuditEvent(
        actor_id=actor_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        transition_id=transition_id,
        detail=detail or {},
    )
    db.add(event)
    await db.flush()
    return event
