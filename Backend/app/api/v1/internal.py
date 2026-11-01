from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Transition
from app.db.session import get_db
from app.services.audit import write_audit
from app.services.ingestion import ingest_transition

router = APIRouter(prefix="/internal", tags=["internal"])


async def service_auth(x_service_token: Annotated[str | None, Header()] = None) -> None:
    if not x_service_token or x_service_token != get_settings().n8n_service_token:
        raise HTTPException(status_code=401, detail="Invalid service token")


@router.post("/sync/{transition_id}")
async def sync(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[None, Depends(service_auth)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    result = await ingest_transition(db, transition_id)
    await write_audit(db, action="internal_sync", entity_type="transition", entity_id=transition_id, transition_id=transition_id, detail=result)
    await db.commit()
    return {"transitionId": transition_id, **result}


@router.post("/pipeline/{transition_id}/run")
async def run_pipeline(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[None, Depends(service_auth)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    transition.status = "ingesting"
    await db.commit()
    return {"transitionId": transition_id, "status": "queued", "orchestrator": get_settings().orchestrator}


@router.post("/pipeline/status")
async def pipeline_status(payload: dict, db: Annotated[AsyncSession, Depends(get_db)], _: Annotated[None, Depends(service_auth)]):
    transition_id = payload.get("transitionId")
    if not transition_id:
        raise HTTPException(status_code=422, detail="transitionId is required")
    return {"accepted": True, "transitionId": transition_id, "status": payload.get("status", "unknown")}


@router.post("/notify-reviewer")
async def notify_reviewer(payload: dict, _: Annotated[None, Depends(service_auth)]):
    return {"accepted": True, "notification": "logged", "detail": {"transitionId": payload.get("transitionId")}}
