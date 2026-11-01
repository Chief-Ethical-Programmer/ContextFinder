import hashlib
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent, PipelineRun, SourceConnection, SourceRecord
from app.ingest.common import IngestedRecord
from app.ingest.file_import import parse_file_tree
from app.ingest.github import GitHubConnector
from app.ingest.slack_export import parse_slack_export
from app.security.redact import redact_secrets

ROOT = Path(__file__).resolve().parents[2]
SEED_ROOT = ROOT / "seed"


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
        defaults = (("github", "technical_only"), ("slack_export", "technical_only"), ("slack_leads_export", "leads_only"), ("drive_export", "technical_only"), ("meeting_notes", "public_team"))
        connections = [await ensure_connection(db, transition_id, kind, access) for kind, access in defaults]
    by_kind = {connection.kind: connection for connection in connections}
    counts: dict[str, int] = {}
    statuses: dict[str, str] = {}

    if "github" in by_kind:
        github_records, github_status = await GitHubConnector(SEED_ROOT / "github").records()
        counts["github"] = await save_records(db, by_kind["github"], github_records)
        statuses["github"] = github_status
    if "slack_export" in by_kind or "slack_leads_export" in by_kind:
        slack_has_uploaded_records = any(
            [await connection_has_records(db, by_kind[kind]) for kind in ("slack_export", "slack_leads_export") if kind in by_kind]
        )
        slack_records = [] if slack_has_uploaded_records else parse_slack_export(SEED_ROOT / "slack")
        if "slack_export" in by_kind and not slack_has_uploaded_records:
            counts["slack"] = await save_records(db, by_kind["slack_export"], [record for record in slack_records if record.metadata.get("channel") != "leadership"])
            statuses["slack_export"] = "imported"
        if "slack_leads_export" in by_kind and not slack_has_uploaded_records:
            counts["slackLeads"] = await save_records(db, by_kind["slack_leads_export"], [record for record in slack_records if record.metadata.get("channel") == "leadership"])
            statuses["slack_leads_export"] = "imported"
    if "drive_export" in by_kind and not await connection_has_records(db, by_kind["drive_export"]):
        counts["drive"] = await save_records(db, by_kind["drive_export"], parse_file_tree(SEED_ROOT / "drive", "doc"))
        statuses["drive_export"] = "imported"
    if "meeting_notes" in by_kind and not await connection_has_records(db, by_kind["meeting_notes"]):
        counts["notes"] = await save_records(db, by_kind["meeting_notes"], parse_file_tree(SEED_ROOT / "notes", "note"))
        statuses["meeting_notes"] = "imported"

    for kind, connection in by_kind.items():
        connection.status = statuses.get(kind, connection.status)
    await db.flush()
    return {"counts": counts, "githubStatus": statuses.get("github", "not_selected")}
