import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class APIModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class LoginRequest(APIModel):
    email: str
    password: str


class SignupRequest(APIModel):
    name: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=6, max_length=8)
    role: Literal["admin", "reviewer", "departing", "incoming"]
    team: str | None = Field(default=None, max_length=120)
    admin_signup_code: str | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Enter your full name")
        return value

    @field_validator("email")
    @classmethod
    def clean_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a valid work email")
        return value

    @field_validator("team")
    @classmethod
    def clean_team(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        if value and len(value) < 2:
            raise ValueError("Enter a team name with at least 2 characters")
        return value

    @model_validator(mode="after")
    def require_role_team(self):
        if self.role == "reviewer" and not self.team:
            raise ValueError("Team lead reviewers must enter their team")
        if self.role == "incoming" and not self.team:
            raise ValueError("New joinees must enter the team they are joining")
        return self


class DemoSwitchRequest(APIModel):
    role: str


class TokenResponse(APIModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(APIModel):
    id: UUID
    email: str
    name: str
    role: str
    team: str = ""


class ProjectMemberResponse(APIModel):
    id: UUID
    name: str
    email: str
    role: str


class ProjectResponse(APIModel):
    id: UUID
    name: str
    description: str
    team: str = ""
    synthetic: bool
    supervisor: str | None = None
    members: list[ProjectMemberResponse] = Field(default_factory=list)


class ProjectRequestCreate(APIModel):
    name: str = Field(min_length=2, max_length=200)
    team: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=10, max_length=4000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Enter a project name")
        return value

    @field_validator("team")
    @classmethod
    def clean_team(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Enter the team this project belongs to")
        return value

    @field_validator("description")
    @classmethod
    def clean_description(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 10:
            raise ValueError("Describe the project in at least 10 characters")
        return value


class ProjectRequestDecision(APIModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=2000)


class SourceSelection(APIModel):
    kind: str
    access_level: str
    config: dict = Field(default_factory=dict)


class SourceConfiguration(APIModel):
    kind: Literal["github", "drive_export", "meeting_notes"]
    access_level: Literal["public_team", "technical_only", "leads_only"]
    config: dict = Field(default_factory=dict)


class TransitionCreate(APIModel):
    project_id: UUID
    departing_user_id: UUID
    incoming_user_id: UUID | None = None
    target_recipient_role: str = "technical_successor"
    due_at: datetime | None = None
    sources: list[SourceSelection] = Field(default_factory=list)


class ReviewerAssignment(APIModel):
    reviewer_id: UUID | None = None
    reviewer_email: str | None = Field(default=None, min_length=5, max_length=320)

    @field_validator("reviewer_email")
    @classmethod
    def normalize_reviewer_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a registered reviewer email")
        return value

    @model_validator(mode="after")
    def require_reviewer_identity(self):
        if (self.reviewer_id is None) == (self.reviewer_email is None):
            raise ValueError("Provide exactly one reviewer ID or email")
        return self


class IncomingAssignment(APIModel):
    incoming_email: str = Field(min_length=5, max_length=320)

    @field_validator("incoming_email")
    @classmethod
    def normalize_incoming_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("Enter a registered incoming member email")
        return value


class PipelineStartRequest(APIModel):
    free_tier_data_attestation: bool


class TransitionResponse(APIModel):
    id: UUID
    project_id: UUID
    departing_user_id: UUID
    incoming_user_id: UUID | None
    target_recipient_role: str
    status: str
    due_at: datetime | None
    incoming_access_expires_at: datetime | None = None
    created_by: UUID
    created_at: datetime


class DashboardResponse(APIModel):
    departing: list[TransitionResponse]
    onboarding: list[TransitionResponse]


class ProblemDetails(APIModel):
    code: str
    message: str
    details: dict = Field(default_factory=dict)


TokenResponse.model_rebuild()
