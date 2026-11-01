import tempfile
from pathlib import Path
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_role
from app.core.access import require_project_admin
from app.db.models import Transition, User
from app.db.session import get_db
from app.ingest.file_import import SUPPORTED_EXTENSIONS, parse_file_tree
from app.ingest.slack_export import parse_slack_export
from app.services.audit import write_audit
from app.services.extraction import extract_and_verify
from app.services.ingestion import (
    ensure_connection,
    ingest_transition,
    record_pipeline_stage,
    save_records,
)

router = APIRouter(tags=["ingestion"])
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_KINDS = {"slack_export", "slack_leads_export", "drive_export", "meeting_notes"}
ALLOWED_ACCESS_LEVELS = {"public_team", "technical_only", "leads_only"}
BLOCKED_SUFFIXES = {".zip", ".tar", ".gz", ".tgz", ".rar", ".7z"}


async def get_transition(db: AsyncSession, transition_id: UUID) -> Transition:
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    return transition


async def assert_transition_access(db: AsyncSession, transition: Transition, user: User) -> None:
    if user.role == "admin":
        await require_project_admin(db, user, transition.project_id)
        return
    if user.role != "departing" or user.id != transition.departing_user_id:
        raise HTTPException(status_code=404, detail="Transition not found")


@router.post("/transitions/{transition_id}/start")
async def start_pipeline(
    transition_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "departing"))],
):
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    transition.status = "ingesting"
    await record_pipeline_stage(db, transition_id, "ingest", "running")
    result = await ingest_transition(db, transition_id)
    extraction = await extract_and_verify(db, transition_id)
    transition.status = "review"
    await record_pipeline_stage(db, transition_id, "ingest", "completed", result)
    await record_pipeline_stage(db, transition_id, "extract", "completed", extraction)
    await write_audit(db, action="ingest", entity_type="transition", actor_id=user.id, entity_id=transition_id, transition_id=transition_id, detail=result)
    await db.commit()
    return {"transitionId": transition_id, "status": transition.status, **result, "extraction": extraction}


@router.post("/transitions/{transition_id}/sources/upload", status_code=status.HTTP_201_CREATED)
async def upload_source(
    transition_id: UUID,
    file: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "departing"))],
    kind: Annotated[str, Form()] = "drive_export",
    access_level: Annotated[str, Form()] = "technical_only",
):
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=422, detail="Unsupported source kind")
    if access_level not in ALLOWED_ACCESS_LEVELS:
        raise HTTPException(status_code=422, detail="Unsupported access level")
    filename = Path(file.filename or "upload").name
    suffix = Path(filename).suffix.lower()
    if filename != file.filename or suffix in BLOCKED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Archives and unsafe filenames are not accepted")
    if kind not in {"slack_export", "slack_leads_export"} and suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported upload type")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload exceeds 10 MB limit")
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / filename
        path.write_bytes(content)
        if kind in {"slack_export", "slack_leads_export"}:
            path = Path(temp_dir) / "slack.json"
            path.write_bytes(content)
            records = parse_slack_export(Path(temp_dir))
        else:
            records = parse_file_tree(Path(temp_dir), "note" if kind == "meeting_notes" else "doc")
    connection = await ensure_connection(db, transition_id, kind, access_level)
    inserted = await save_records(db, connection, records)
    connection.status = "imported"
    await write_audit(db, action="ingest", entity_type="source_connection", actor_id=user.id, entity_id=connection.id, transition_id=transition_id, detail={"filename": filename, "records": inserted})
    await db.commit()
    return {"connectionId": connection.id, "filename": filename, "recordsImported": inserted}


@router.get("/transitions/{transition_id}/pipeline")
async def pipeline_status(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await get_transition(db, transition_id)
    await require_transition_access(db, user, transition)
    from app.db.models import PipelineRun

    runs = list((await db.scalars(select(PipelineRun).where(PipelineRun.transition_id == transition_id).order_by(PipelineRun.started_at))).all())
    return {"transitionId": transition_id, "stages": [{"stage": run.stage, "status": run.status, "detail": run.detail, "startedAt": run.started_at, "finishedAt": run.finished_at} for run in runs]}
