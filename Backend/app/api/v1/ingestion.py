import tempfile
from pathlib import Path, PurePosixPath
from typing import Annotated
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.access import require_project_admin, require_transition_access
from app.core.deps import current_user, require_role
from app.db.models import PipelineRun, SourceConnection, SourceRecord, Transition, User
from app.db.session import SessionLocal, get_db
from app.ingest.file_import import SUPPORTED_EXTENSIONS, parse_file_tree
from app.ingest.github import normalize_public_repository
from app.schemas import PipelineStartRequest, SourceConfiguration
from app.services.approved_project_pipeline import process_approved_project
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
ALLOWED_KINDS = {"drive_export", "meeting_notes"}
CONFIGURABLE_KINDS = {"github", "drive_export", "meeting_notes"}
ALLOWED_ACCESS_LEVELS = {"public_team", "technical_only", "leads_only"}
BLOCKED_SUFFIXES = {".tar", ".gz", ".tgz", ".rar", ".7z"}


async def get_transition(db: AsyncSession, transition_id: UUID) -> Transition:
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    return transition


async def assert_transition_access(db: AsyncSession, transition: Transition, user: User) -> None:
    if user.role == "admin":
        await require_project_admin(db, user, transition.project_id)
        return
    departing_member = user.role == "departing" and user.id == transition.departing_user_id
    assigned_reviewer = user.role == "reviewer" and user.id == transition.reviewer_id
    if not (departing_member or assigned_reviewer):
        raise HTTPException(status_code=404, detail="Transition not found")


@router.post("/transitions/{transition_id}/start")
async def start_pipeline(
    transition_id: UUID,
    payload: PipelineStartRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "departing", "reviewer"))],
):
    settings = get_settings()
    actor_id = user.id
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    if transition.status == "awaiting_project_approval":
        raise HTTPException(status_code=409, detail="Save and submit the project sources from the project request to start analysis.")
    if not payload.free_tier_data_attestation:
        raise HTTPException(status_code=422, detail="Confirm that every source is public or synthetic and contains no sensitive, confidential, or personal information before sending it to Gemini free tier.")
    if settings.llm_mode not in {"live", "auto"} or not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Live Gemini is not configured. Set LLM_MODE=live and GEMINI_API_KEY in the backend environment, then restart the API.")

    transition.status = "ingesting"
    await record_pipeline_stage(db, transition_id, "ingest", "running")
    try:
        result = await ingest_transition(db, transition_id)
        extraction = await extract_and_verify(db, transition_id, replace_existing=True)
        transition.status = "review"
        await record_pipeline_stage(db, transition_id, "ingest", "completed", result)
        await record_pipeline_stage(db, transition_id, "extract", "completed", extraction)
        await write_audit(db, action="ingest", entity_type="transition", actor_id=user.id, entity_id=transition_id, transition_id=transition_id, detail={**result, "geminiFreeTierAttestation": True})
        await db.commit()
        return {"transitionId": transition_id, "status": transition.status, **result, "extraction": extraction}
    except Exception as exc:
        await db.rollback()
        async with SessionLocal() as failure_db:
            failed = await failure_db.get(Transition, transition_id)
            if failed:
                failed.status = "sources_ready"
                await record_pipeline_stage(failure_db, transition_id, "extract", "failed", {"message": str(exc)[:500]})
                await write_audit(failure_db, action="ingest_failed", entity_type="transition", actor_id=actor_id, entity_id=transition_id, transition_id=transition_id, detail={"message": str(exc)[:500]})
                await failure_db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=502, detail=str(exc) or "Source extraction failed. Uploaded records remain available for retry.") from exc


@router.post("/transitions/{transition_id}/retry-analysis", status_code=status.HTTP_202_ACCEPTED)
async def retry_analysis(
    transition_id: UUID,
    payload: PipelineStartRequest,
    background_tasks: BackgroundTasks,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "departing", "reviewer"))],
):
    settings = get_settings()
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    if transition.status != "sources_ready":
        raise HTTPException(status_code=409, detail="This handover is not ready for an analysis retry.")
    if not payload.free_tier_data_attestation:
        raise HTTPException(status_code=422, detail="Confirm that the saved sources may be processed before analysis.")
    if settings.llm_mode not in {"live", "auto"} or not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Analysis is not configured. Check the backend model settings and restart the API.")
    source_exists = await db.scalar(select(SourceConnection.id).where(SourceConnection.transition_id == transition_id).limit(1))
    if not source_exists:
        raise HTTPException(status_code=422, detail="No saved sources are available to analyze.")

    transition.status = "ingesting"
    actor_id = user.id
    await write_audit(
        db,
        action="analysis_retry_requested",
        entity_type="transition",
        actor_id=actor_id,
        entity_id=transition_id,
        transition_id=transition_id,
        detail={"source_attested": True},
    )
    await db.commit()
    background_tasks.add_task(process_approved_project, transition_id, actor_id)
    return {"transitionId": str(transition_id), "status": "ingesting", "queued": True}


@router.post("/transitions/{transition_id}/sources/upload", status_code=status.HTTP_201_CREATED)
async def upload_source(
    transition_id: UUID,
    file: Annotated[UploadFile, File(...)],
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "departing", "reviewer"))],
    kind: Annotated[str, Form()] = "drive_export",
    access_level: Annotated[str, Form()] = "technical_only",
):
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    if kind not in ALLOWED_KINDS:
        raise HTTPException(status_code=422, detail="Unsupported source kind")
    if access_level not in ALLOWED_ACCESS_LEVELS:
        raise HTTPException(status_code=422, detail="Unsupported access level")
    # Browsers include folder-relative paths when a directory picker is used.
    # Store only the basename so nested paths cannot affect temporary-file writes.
    filename = PurePosixPath((file.filename or "upload").replace("\\", "/")).name
    suffix = Path(filename).suffix.lower()
    if not filename or suffix in BLOCKED_SUFFIXES:
        raise HTTPException(status_code=400, detail="The uploaded filename is not supported.")
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported upload type")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Upload exceeds 10 MB limit")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / filename
            path.write_bytes(content)
            records = parse_file_tree(Path(temp_dir), "note" if kind == "meeting_notes" else "doc")
            if not records:
                raise HTTPException(status_code=422, detail="No extractable text was found. The PDF may be scanned; provide a text-based PDF or DOCX, TXT, or Markdown file.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc) or "The uploaded source file could not be parsed.") from exc
    connection = await ensure_connection(db, transition_id, kind, access_level)
    inserted = await save_records(db, connection, records)
    connection.status = "imported"
    await write_audit(db, action="ingest", entity_type="source_connection", actor_id=user.id, entity_id=connection.id, transition_id=transition_id, detail={"filename": filename, "records": inserted})
    await db.commit()
    return {"connectionId": connection.id, "filename": filename, "recordsImported": inserted}


@router.post("/transitions/{transition_id}/sources/configure", status_code=status.HTTP_201_CREATED)
async def configure_source(
    transition_id: UUID,
    payload: SourceConfiguration,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin", "departing", "reviewer"))],
):
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    if payload.kind not in CONFIGURABLE_KINDS:
        raise HTTPException(status_code=422, detail="Unsupported source kind")
    if payload.kind == "github":
        try:
            repository = normalize_public_repository(str(payload.config.get("repository", "")))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        config = {"repository": repository}
    else:
        config = {}
    connection = await ensure_connection(db, transition_id, payload.kind, payload.access_level)
    connection.config = config
    await db.commit()
    return {"connectionId": connection.id, "kind": connection.kind, "config": connection.config}


@router.post("/transitions/{transition_id}/free-tier-attestation")
async def attest_sources_for_gemini(
    transition_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("departing"))],
):
    transition = await get_transition(db, transition_id)
    if transition.departing_user_id != user.id or transition.status in {"awaiting_admin_approval", "published", "acknowledged"}:
        raise HTTPException(status_code=409, detail="Only the departing member can confirm sources before final handover approval.")
    connections = list((await db.scalars(select(SourceConnection).where(SourceConnection.transition_id == transition_id))).all())
    if not connections:
        raise HTTPException(status_code=422, detail="Save at least one project source before confirming Gemini processing.")
    counts = {}
    for connection in connections:
        counts[connection.kind] = await db.scalar(select(func.count(SourceRecord.id)).where(SourceRecord.connection_id == connection.id)) or 0
    await write_audit(
        db,
        action="gemini_free_tier_attestation",
        entity_type="transition",
        actor_id=user.id,
        entity_id=transition_id,
        transition_id=transition_id,
        detail={"sources": counts, "confirmed": True},
    )
    await db.commit()
    return {"transitionId": str(transition_id), "attested": True}


@router.get("/transitions/{transition_id}/pipeline")
async def pipeline_status(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await get_transition(db, transition_id)
    await require_transition_access(db, user, transition)
    runs = list((await db.scalars(select(PipelineRun).where(PipelineRun.transition_id == transition_id).order_by(PipelineRun.started_at))).all())
    return {"transitionId": transition_id, "stages": [{"stage": run.stage, "status": run.status, "detail": run.detail, "startedAt": run.started_at, "finishedAt": run.finished_at} for run in runs]}


@router.get("/transitions/{transition_id}/source-intake")
async def source_intake(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await get_transition(db, transition_id)
    await assert_transition_access(db, transition, user)
    connections = list((await db.scalars(select(SourceConnection).where(SourceConnection.transition_id == transition_id).order_by(SourceConnection.kind))).all())
    items = []
    for connection in connections:
        count = await db.scalar(select(func.count(SourceRecord.id)).where(SourceRecord.connection_id == connection.id))
        items.append({"kind": connection.kind, "accessLevel": connection.access_level, "status": connection.status, "recordCount": count or 0, "config": connection.config or {}})
    return {"transitionId": str(transition_id), "status": transition.status, "items": items}
