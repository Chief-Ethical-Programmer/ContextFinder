import hashlib
from datetime import UTC, datetime
from uuid import UUID

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent, PipelineRun, SourceConnection, SourceRecord
from app.ingest.common import IngestedRecord
from app.ingest.github import GitHubConnector, normalize_public_repository
from app.security.redact import redact_secrets

MAX_HANDOVER_RECORDS = 2_000
MAX_HANDOVER_CHARS = 500_000


async def record_pipeline_stage(db: AsyncSession, transition_id: UUID, stage: str, status: str, detail: dict | None = None) -> PipelineRun:
    run = PipelineRun(transition_id=transition_id, stage=stage, status=status, detail=detail or {})
    if status in {"completed", "failed"}:
        run.finished_at = datetime.now(UTC)
    db.add(run)
    await db.flush()
    return run


async def ensure_connection(db: AsyncSession, transition_id: UUID, kind: str, access_level: str) -> SourceConnection:
    connection = await db.scalar(select(SourceConnection).where(SourceConnection.transition_id == transition_id, SourceConnection.kind == kind))
    if not connection:
        connection = SourceConnection(transition_id=transition_id, kind=kind, access_level=access_level, config={}, status="configured")
        db.add(connection)
        await db.flush()
    elif connection.access_level != access_level:
        raise HTTPException(
            status_code=409,
            detail="This source is already configured with a different access level. Update it in project settings before uploading more data.",
        )
    return connection


async def save_records(db: AsyncSession, connection: SourceConnection, records: list[IngestedRecord]) -> int:
    inserted = 0
    for item in records:
        redacted = redact_secrets(item.text)
        content_hash = hashlib.sha256(redacted.text.encode("utf-8")).hexdigest()
        existing = await db.scalar(select(SourceRecord).where(SourceRecord.connection_id == connection.id, SourceRecord.external_id == item.external_id))
        if existing:
            continue
        source_record = SourceRecord(connection_id=connection.id, external_id=item.external_id, kind=item.kind, author=item.author, occurred_at=item.occurred_at, url=item.url, text=redacted.text, metadata_json={**item.metadata, "redaction_count": redacted.count}, access_level=connection.access_level, content_hash=content_hash, redacted=redacted.redacted)
        db.add(source_record)
        await db.flush()
        if redacted.redacted:
            db.add(AuditEvent(action="secret_redacted", entity_type="source_record", entity_id=source_record.id, detail={"count": redacted.count}))
        inserted += 1
    await db.flush()
    return inserted


async def connection_has_records(db: AsyncSession, connection: SourceConnection) -> bool:
    record_id = await db.scalar(
        select(SourceRecord.id)
        .where(SourceRecord.connection_id == connection.id)
        .limit(1)
    )
    return record_id is not None


async def ingest_transition(db: AsyncSession, transition_id: UUID) -> dict:
    connections = list((await db.scalars(select(SourceConnection).where(SourceConnection.transition_id == transition_id))).all())
    if not connections:
        raise HTTPException(status_code=422, detail="No sources were selected for this handover.")
    by_kind = {connection.kind: connection for connection in connections}
    counts: dict[str, int] = {}
    statuses: dict[str, str] = {}

    if "github" in by_kind:
        repository = (by_kind["github"].config or {}).get("repository", "")
        if not repository:
            raise HTTPException(status_code=422, detail="Enter a public GitHub repository before starting ingestion.")
        try:
            repository = normalize_public_repository(repository)
            records = await GitHubConnector().records(repository)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"GitHub import failed: {exc}") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Could not fetch selected files from the public GitHub repository. Try again later.") from exc
        counts["github"] = await save_records(db, by_kind["github"], records)
        statuses["github"] = "imported_public"

    for kind, connection in by_kind.items():
        if kind != "github":
            has_records = await connection_has_records(db, connection)
            if not has_records:
                raise HTTPException(status_code=422, detail=f"No uploaded records were found for {kind}. Upload its source files first.")
            statuses[kind] = "imported"
        connection.status = statuses.get(kind, connection.status)

    records = list((await db.scalars(
        select(SourceRecord).join(SourceConnection).where(SourceConnection.transition_id == transition_id)
    )).all())
    if len(records) > MAX_HANDOVER_RECORDS:
        raise HTTPException(status_code=413, detail=f"This handover has more than {MAX_HANDOVER_RECORDS} source records.")
    if sum(len(record.text) for record in records) > MAX_HANDOVER_CHARS:
        raise HTTPException(status_code=413, detail=f"This handover exceeds the {MAX_HANDOVER_CHARS:,}-character processing limit.")
    await db.flush()
    return {"counts": counts, "statuses": statuses, "records": len(records), "githubStatus": statuses.get("github", "not_selected")}
