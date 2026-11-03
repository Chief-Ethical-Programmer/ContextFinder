import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(String(500))
    role: Mapped[str] = mapped_column(String(30), index=True)
    team: Mapped[str] = mapped_column(String(120), default="")


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    team: Mapped[str] = mapped_column(String(120), default="")
    synthetic: Mapped[bool] = mapped_column(Boolean, default=True)


class ProjectRole(Base):
    __tablename__ = "project_roles"
    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_role: Mapped[str] = mapped_column(String(40))


class ProjectRequest(Base):
    __tablename__ = "project_requests"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    team: Mapped[str] = mapped_column(String(120), default="")
    requested_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    reviewer_note: Mapped[str] = mapped_column(Text, default="")
    project_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), index=True)
    transition_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transitions.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Transition(Base):
    __tablename__ = "transitions"
    id: Mapped[uuid.UUID] = uuid_pk()
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    departing_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    incoming_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    target_recipient_role: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="ingesting", index=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    incoming_access_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SourceConnection(Base):
    __tablename__ = "source_connections"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    access_level: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="configured")


class SourceRecord(Base):
    __tablename__ = "source_records"
    id: Mapped[uuid.UUID] = uuid_pk()
    connection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("source_connections.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(500))
    kind: Mapped[str] = mapped_column(String(30))
    author: Mapped[str] = mapped_column(String(200), default="")
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    url: Mapped[str | None] = mapped_column(String(1000))
    text: Mapped[str] = mapped_column(Text)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    access_level: Mapped[str] = mapped_column(String(30))
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    redacted: Mapped[bool] = mapped_column(Boolean, default=False)
    __table_args__ = (Index("ix_source_records_connection_external", "connection_id", "external_id", unique=True),)


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)


class KnowledgeClaim(Base):
    __tablename__ = "knowledge_claims"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(30))
    statement: Mapped[str] = mapped_column(Text)
    subject_key: Mapped[str] = mapped_column(String(200), index=True)
    status_value: Mapped[str | None] = mapped_column(String(300))
    trust_label: Mapped[str] = mapped_column(String(30), index=True)
    trust_reason: Mapped[str] = mapped_column(Text, default="")
    access_level: Mapped[str] = mapped_column(String(30))
    origin: Mapped[str] = mapped_column(String(30))
    review_state: Mapped[str] = mapped_column(String(30), default="proposed")
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    flags: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_claims_transition_trust", "transition_id", "trust_label"),)


class ClaimEvidence(Base):
    __tablename__ = "claim_evidence"
    id: Mapped[uuid.UUID] = uuid_pk()
    claim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="CASCADE"), index=True)
    source_record_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("source_records.id", ondelete="CASCADE"), index=True)
    excerpt: Mapped[str] = mapped_column(Text)
    resolved: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str] = mapped_column(Text, default="")


class ConflictPair(Base):
    __tablename__ = "conflict_pairs"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    claim_a_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="CASCADE"), index=True)
    claim_b_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="CASCADE"), index=True)
    reason: Mapped[str] = mapped_column(Text)


class Dependency(Base):
    __tablename__ = "dependencies"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    from_entity: Mapped[str] = mapped_column(String(200))
    to_entity: Mapped[str] = mapped_column(String(200))
    claim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="SET NULL"), index=True)


class ClaimVersion(Base):
    __tablename__ = "claim_versions"
    id: Mapped[uuid.UUID] = uuid_pk()
    claim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    statement: Mapped[str] = mapped_column(Text)
    changed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    change_kind: Mapped[str] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ReviewEvent(Base):
    __tablename__ = "review_events"
    id: Mapped[uuid.UUID] = uuid_pk()
    claim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ExitQuestion(Base):
    __tablename__ = "exit_questions"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    claim_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="CASCADE"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    system_finding: Mapped[str] = mapped_column(Text)
    trust_label: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="open")


class ExitAnswer(Base):
    __tablename__ = "exit_answers"
    id: Mapped[uuid.UUID] = uuid_pk()
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exit_questions.id", ondelete="CASCADE"), index=True)
    answered_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20))
    created_claim_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("knowledge_claims.id", ondelete="SET NULL"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HandoverVersion(Base):
    __tablename__ = "handover_versions"
    id: Mapped[uuid.UUID] = uuid_pk()
    transition_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("transitions.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    published_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    remarks: Mapped[str] = mapped_column(Text, default="")
    target_recipient_role: Mapped[str] = mapped_column(String(30))
    snapshot: Mapped[dict] = mapped_column(JSONB, default=dict)


class RoleView(Base):
    __tablename__ = "role_views"
    id: Mapped[uuid.UUID] = uuid_pk()
    handover_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("handover_versions.id", ondelete="CASCADE"), index=True)
    recipient_role: Mapped[str] = mapped_column(String(30))
    summary: Mapped[str] = mapped_column(Text)
    plan_30_60_90: Mapped[dict] = mapped_column(JSONB, default=dict)
    generation_mode: Mapped[str] = mapped_column(String(20), default="template")
    claim_ids: Mapped[list] = mapped_column(JSONB, default=list)


class RecipientAccess(Base):
    __tablename__ = "recipient_access"
    id: Mapped[uuid.UUID] = uuid_pk()
    handover_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("handover_versions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    recipient_role: Mapped[str] = mapped_column(String(30))


class AccessRequest(Base):
    __tablename__ = "access_requests"
    id: Mapped[uuid.UUID] = uuid_pk()
    handover_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("handover_versions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Acknowledgement(Base):
    __tablename__ = "acknowledgements"
    id: Mapped[uuid.UUID] = uuid_pk()
    handover_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("handover_versions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    acknowledged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (Index("ix_acknowledgements_version_user", "handover_version_id", "user_id", unique=True),)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[uuid.UUID] = uuid_pk()
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    transition_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("transitions.id"), index=True)
    detail: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
