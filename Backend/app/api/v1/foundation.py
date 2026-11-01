from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_user, require_role
from app.core.access import require_project_admin, require_transition_access
from app.db.models import AuditEvent, ClaimEvidence, Project, ProjectRole, SourceConnection, SourceRecord, Transition, User
from app.db.session import get_db
from app.schemas import (
    DashboardResponse,
    ProjectResponse,
    ProjectMemberResponse,
    TransitionCreate,
    TransitionResponse,
    UserResponse,
)
from app.services.audit import write_audit

router = APIRouter(tags=["foundation"])


@router.get("/projects", response_model=list[ProjectResponse])
async def projects(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("admin"))]):
    project_rows = list((await db.scalars(select(Project).order_by(Project.name))).all())
    result = []
    for project in project_rows:
        memberships = list((await db.execute(
            select(ProjectRole, User)
            .join(User, User.id == ProjectRole.user_id)
            .where(ProjectRole.project_id == project.id)
        )).all())
        supervisor = next((member for membership, member in memberships if membership.user_id == user.id and membership.project_role == "admin"), None)
        if not supervisor:
            continue
        result.append(ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            synthetic=project.synthetic,
            supervisor=supervisor.name,
            members=[
                ProjectMemberResponse(id=member.id, name=member.name, email=member.email, role=membership.project_role)
                for membership, member in memberships
                if member.id != supervisor.id
            ],
        ))
    return result


@router.get("/users", response_model=list[UserResponse])
async def users(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
    role: str | None = None,
):
    supervised_project_ids = select(ProjectRole.project_id).where(
        ProjectRole.user_id == user.id,
        ProjectRole.project_role == "admin",
    )
    query = (
        select(User)
        .join(ProjectRole, ProjectRole.user_id == User.id)
        .where(ProjectRole.project_id.in_(supervised_project_ids))
        .distinct()
        .order_by(User.name)
    )
    if role:
        query = query.where(User.role == role)
    return list((await db.scalars(query)).all())


@router.post("/transitions", response_model=TransitionResponse, status_code=201)
async def create_transition(
    payload: TransitionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    project = await db.get(Project, payload.project_id)
    if not project or not await db.get(User, payload.departing_user_id) or not await db.get(User, payload.incoming_user_id):
        raise HTTPException(status_code=404, detail="Project or user not found")
    if payload.departing_user_id == payload.incoming_user_id:
        raise HTTPException(status_code=422, detail="The departing and incoming members must be different people")
    await require_project_admin(db, user, payload.project_id)
    departing_is_member = await db.scalar(select(ProjectRole.id).where(
        ProjectRole.project_id == payload.project_id,
        ProjectRole.user_id == payload.departing_user_id,
        ProjectRole.project_role == "departing",
    ))
    incoming_is_member = await db.scalar(select(ProjectRole.id).where(
        ProjectRole.project_id == payload.project_id,
        ProjectRole.user_id == payload.incoming_user_id,
        ProjectRole.project_role == "incoming",
    ))
    if not departing_is_member or not incoming_is_member:
        raise HTTPException(status_code=422, detail="Departing and incoming users must be assigned to this project")
    allowed_kinds = {"github", "slack_export", "drive_export", "meeting_notes"}
    allowed_access = {"public_team", "technical_only", "leads_only"}
    allowed_roles = {"project_lead", "technical_successor", "new_volunteer"}
    if payload.target_recipient_role not in allowed_roles:
        raise HTTPException(status_code=422, detail="Unsupported recipient role")
    source_kinds = [source.kind for source in payload.sources]
    if len(source_kinds) != len(set(source_kinds)):
        raise HTTPException(status_code=422, detail="Each source type can only be configured once")
    for source in payload.sources:
        if source.kind not in allowed_kinds or source.access_level not in allowed_access:
            raise HTTPException(status_code=422, detail="Unsupported source kind or access level")
    transition = Transition(**payload.model_dump(exclude={"sources"}), created_by=user.id)
    db.add(transition)
    await db.flush()
    configured = {source.kind: source.access_level for source in payload.sources}
    for kind, access_level in configured.items():
        db.add(SourceConnection(transition_id=transition.id, kind=kind, access_level=access_level, config={}, status="configured"))
    if "slack_export" in configured:
        db.add(SourceConnection(transition_id=transition.id, kind="slack_leads_export", access_level="leads_only", config={}, status="configured"))
    await write_audit(db, action="transition_created", entity_type="transition", actor_id=user.id, entity_id=transition.id, transition_id=transition.id)
    await db.commit()
    await db.refresh(transition)
    return transition


@router.get("/transitions/{transition_id}", response_model=TransitionResponse)
async def get_transition(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition)
    return transition


@router.get("/transitions/{transition_id}/sources")
async def transition_sources(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition, admin_only=True)
    connections = list((await db.scalars(
        select(SourceConnection).where(SourceConnection.transition_id == transition_id).order_by(SourceConnection.kind)
    )).all())
    items = []
    for connection in connections:
        record_count = await db.scalar(select(func.count(SourceRecord.id)).where(SourceRecord.connection_id == connection.id))
        linked_claim_count = await db.scalar(
            select(func.count(distinct(ClaimEvidence.claim_id)))
            .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
            .where(SourceRecord.connection_id == connection.id)
        )
        items.append({
            "id": str(connection.id),
            "transitionId": str(transition_id),
            "kind": connection.kind,
            "access": connection.access_level,
            "status": connection.status,
            "recordCount": record_count or 0,
            "linkedClaimCount": linked_claim_count or 0,
        })
    return {"items": items}


@router.get("/transitions/{transition_id}/audit")
async def transition_audit(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition, admin_only=True)
    rows = list((await db.execute(
        select(AuditEvent, User)
        .outerjoin(User, User.id == AuditEvent.actor_id)
        .where(AuditEvent.transition_id == transition_id)
        .order_by(AuditEvent.created_at.desc())
    )).all())
    return [{
        "id": str(event.id),
        "transitionId": str(transition_id),
        "actor": actor.name if actor else "System",
        "action": event.action.replace("_", " ").capitalize(),
        "target": event.detail.get("filename") or event.entity_type.replace("_", " ").capitalize(),
        "at": event.created_at,
    } for event, actor in rows]


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    if user.role == "admin":
        supervised_project_ids = select(ProjectRole.project_id).where(
            ProjectRole.user_id == user.id,
            ProjectRole.project_role == "admin",
        )
        transitions = list((await db.scalars(
            select(Transition).where(Transition.project_id.in_(supervised_project_ids)).order_by(Transition.created_at.desc())
        )).all())
        return DashboardResponse(departing=transitions, onboarding=[])
    transitions = list((await db.scalars(select(Transition).order_by(Transition.created_at.desc()))).all())
    departing = [item for item in transitions if item.departing_user_id == user.id]
    onboarding = [item for item in transitions if item.incoming_user_id == user.id]
    return DashboardResponse(departing=departing, onboarding=onboarding)


