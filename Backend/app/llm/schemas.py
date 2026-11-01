from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CandidateEvidence(BaseModel):
    source_record_id: UUID
    excerpt: str


class ReferencedArtifact(BaseModel):
    name: str
    resolved: bool = True


class DependencyEdge(BaseModel):
    from_entity: str = Field(alias="from")
    to_entity: str = Field(alias="to")

    model_config = ConfigDict(populate_by_name=True)


class CandidateClaim(BaseModel):
    type: str
    statement: str
    subject_key: str
    status_value: str | None = None
    occurred_at: datetime | None = None
    referenced_artifact: ReferencedArtifact | None = None
    evidence: list[CandidateEvidence] = Field(min_length=1)
    dependency_edge: DependencyEdge | None = None


class ChunkInput(BaseModel):
    source_record_id: UUID
    text: str
    kind: str
    author: str = ""


class ClaimLite(BaseModel):
    id: UUID
    statement: str
    type: str
    evidence_ids: list[UUID]


class RoleViewDraft(BaseModel):
    summary: str
    plan_30_60_90: dict
    claim_ids: list[UUID]
