from datetime import datetime
import re
from uuid import UUID
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


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
    password: str = Field(min_length=10, max_length=128)
    role: Literal["admin", "departing", "incoming"]
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


class ProjectMemberResponse(APIModel):
    id: UUID
    name: str
    email: str
    role: str


class ProjectResponse(APIModel):
    id: UUID
    name: str
    description: str
    synthetic: bool
    supervisor: str | None = None
    members: list[ProjectMemberResponse] = Field(default_factory=list)


class SourceSelection(APIModel):
    kind: str
    access_level: str


class TransitionCreate(APIModel):
    project_id: UUID
    departing_user_id: UUID
    incoming_user_id: UUID
    target_recipient_role: str = "technical_successor"
    due_at: datetime | None = None
    sources: list[SourceSelection] = Field(default_factory=list)


class TransitionResponse(APIModel):
    id: UUID
    project_id: UUID
    departing_user_id: UUID
    incoming_user_id: UUID
    target_recipient_role: str
    status: str
    due_at: datetime | None
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
