import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app.db.models import AuditEvent, Transition
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)
ACCESS_EXPIRY_POLL_SECONDS = 60


async def revoke_expired_incoming_access() -> int:
    """Remove expired incoming assignments; route guards enforce expiry between sweeps."""
    now = datetime.now(UTC)
    async with SessionLocal() as db:
        transitions = list((await db.scalars(
            select(Transition)
            .where(
                Transition.incoming_user_id.is_not(None),
                Transition.incoming_access_expires_at.is_not(None),
                Transition.incoming_access_expires_at <= now,
                Transition.status.in_({"published", "acknowledged"}),
            )
            .with_for_update(skip_locked=True)
        )).all())
        for transition in transitions:
            expired_user_id = transition.incoming_user_id
            transition.incoming_user_id = None
            db.add(AuditEvent(
                actor_id=None,
                action="incoming_access_expired",
                entity_type="transition",
                entity_id=transition.id,
                transition_id=transition.id,
                detail={"incoming_user_id": str(expired_user_id), "expired_at": transition.incoming_access_expires_at.isoformat()},
            ))
        if transitions:
            await db.commit()
        return len(transitions)


async def access_expiry_worker() -> None:
    while True:
        try:
            count = await revoke_expired_incoming_access()
            if count:
                logger.info("Revoked expired incoming access for %s handover(s)", count)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Incoming access expiry sweep failed")
        await asyncio.sleep(ACCESS_EXPIRY_POLL_SECONDS)
