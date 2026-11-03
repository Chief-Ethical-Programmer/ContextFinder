import math
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.access import require_project_admin, require_transition_access
from app.core.deps import current_user, require_role
from app.db.models import (
    AuditEvent,
    ClaimEvidence,
    KnowledgeClaim,
    Project,
    ProjectRequest,
    ProjectRole,
    SourceConnection,
    SourceRecord,
    Transition,
    User,
)
from app.db.session import get_db
from app.schemas import (
    DashboardResponse,
    IncomingAssignment,
    ProjectMemberResponse,
    ProjectRequestCreate,
    ProjectRequestDecision,
    ProjectResponse,
    ReviewerAssignment,
    TransitionCreate,
    TransitionResponse,
    UserResponse,
)
from app.services.approved_project_pipeline import process_approved_project
from app.services.audit import write_audit
from app.services.claim_filters import reviewable_claim_filter

router = APIRouter(tags=["foundation"])


def incoming_access_window(transition: Transition) -> tuple[int, datetime | None]:
    expires_at = transition.incoming_access_expires_at
    if not expires_at:
        return 0, None
    seconds_left = (expires_at - datetime.now(UTC)).total_seconds()
    return max(0, math.ceil(seconds_left / 86_400)), expires_at


def project_request_payload(request: ProjectRequest, requester: User) -> dict:
    return {"id": str(request.id), "name": request.name, "team": request.team, "description": request.description, "status": request.status, "requestedBy": {"id": str(requester.id), "name": requester.name, "email": requester.email}, "createdAt": request.created_at, "reviewedAt": request.reviewed_at, "reviewerNote": request.reviewer_note, "projectId": str(request.project_id) if request.project_id else None, "transitionId": str(request.transition_id) if request.transition_id else None}


@router.post("/project-requests", status_code=201)
async def create_project_request(payload: ProjectRequestCreate, response: Response, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    if user.role != "departing":
        raise HTTPException(status_code=403, detail="Only departing members can create project handover requests")
    existing_request = await db.scalar(select(ProjectRequest).where(
        ProjectRequest.requested_by == user.id,
        ProjectRequest.status.in_(["draft", "pending"]),
        func.lower(ProjectRequest.name) == payload.name.lower(),
    ).order_by(ProjectRequest.created_at.desc()))
    if existing_request:
        if existing_request.status == "draft":
            conflicting_project = await db.scalar(select(Project.id).where(
                func.lower(Project.name) == payload.name.lower(),
                Project.id != existing_request.project_id,
            ))
            if conflicting_project:
                raise HTTPException(status_code=409, detail="Another workspace project already has this name. Use a different project name or continue with the existing project request below.")
            existing_request.name = payload.name
            existing_request.team = payload.team
            existing_request.description = payload.description
            project = await db.get(Project, existing_request.project_id) if existing_request.project_id else None
            if project:
                project.name = payload.name
                project.team = payload.team
                project.description = payload.description
            await db.commit()
            await db.refresh(existing_request)
        response.status_code = 200
        return project_request_payload(existing_request, user)
    existing_project = await db.scalar(select(Project.id).where(func.lower(Project.name) == payload.name.lower()))
    if existing_project:
        raise HTTPException(status_code=409, detail="Another workspace project already has this name. Sign in as the departing member assigned to it or choose a different project name.")
    workspace_admin = await db.scalar(select(User).where(User.role == "admin").order_by(User.email).limit(1))
    if not workspace_admin:
        raise HTTPException(status_code=503, detail="This workspace has no configured administrator")
    project = Project(name=payload.name, team=payload.team, description=payload.description, synthetic=False)
    db.add(project)
    await db.flush()
    db.add(ProjectRole(project_id=project.id, user_id=workspace_admin.id, project_role="admin"))
    db.add(ProjectRole(project_id=project.id, user_id=user.id, project_role="departing"))
    transition = Transition(project_id=project.id, departing_user_id=user.id, incoming_user_id=None, target_recipient_role="technical_successor", status="awaiting_project_approval", created_by=workspace_admin.id)
    db.add(transition)
    await db.flush()
    request = ProjectRequest(name=payload.name, team=payload.team, description=payload.description, requested_by=user.id, status="draft", project_id=project.id, transition_id=transition.id)
    db.add(request)
    await db.flush()
    await write_audit(db, action="project_draft_created", entity_type="project_request", actor_id=user.id, entity_id=request.id, detail={"name": request.name})
    await db.commit()
    await db.refresh(request)
    return project_request_payload(request, user)


@router.get("/project-requests/mine")
async def my_project_requests(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    requests = list((await db.scalars(select(ProjectRequest).where(ProjectRequest.requested_by == user.id).order_by(ProjectRequest.created_at.desc()))).all())
    result = []
    for request in requests:
        item = project_request_payload(request, user)
        item["sourcesSubmitted"] = bool(request.transition_id and await db.scalar(select(SourceConnection.id).where(SourceConnection.transition_id == request.transition_id).limit(1)))
        result.append(item)
    return result


@router.get("/admin/project-requests")
async def list_project_requests(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("admin"))]):
    requests = list((await db.scalars(select(ProjectRequest).where(ProjectRequest.status != "draft").order_by(ProjectRequest.status, ProjectRequest.created_at.desc()))).all())
    result = []
    for request in requests:
        requester = await db.get(User, request.requested_by)
        if requester:
            result.append(project_request_payload(request, requester))
    return result


@router.post("/project-requests/{request_id}/submit")
async def submit_project_request(request_id: UUID, background_tasks: BackgroundTasks, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    request = await db.get(ProjectRequest, request_id)
    if not request or request.requested_by != user.id:
        raise HTTPException(status_code=404, detail="Project draft not found")
    if request.status != "draft":
        raise HTTPException(status_code=409, detail="This project request has already been submitted")
    has_sources = False
    if request.transition_id:
        connections = list((await db.scalars(select(SourceConnection).where(SourceConnection.transition_id == request.transition_id))).all())
        for connection in connections:
            if connection.kind == "github" and connection.config and connection.config.get("repository"):
                has_sources = True
                break
            record_count = await db.scalar(select(func.count(SourceRecord.id)).where(SourceRecord.connection_id == connection.id))
            if record_count:
                has_sources = True
                break
    if not has_sources:
        raise HTTPException(status_code=400, detail="Add a public GitHub repository or upload at least one source file before starting analysis")
    attested = await db.scalar(select(AuditEvent.id).where(
        AuditEvent.transition_id == request.transition_id,
        AuditEvent.actor_id == user.id,
        AuditEvent.action == "gemini_free_tier_attestation",
    ).limit(1)) if request.transition_id else None
    if not attested:
        raise HTTPException(status_code=422, detail="Confirm that the saved sources may be processed by Gemini before starting analysis")
    settings = get_settings()
    if settings.llm_mode not in {"live", "auto"} or not settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Analysis is not configured. Check the backend model settings before submitting these sources.")
    request.status = "pending"
    transition = await db.get(Transition, request.transition_id) if request.transition_id else None
    if not transition:
        raise HTTPException(status_code=409, detail="This project request has no handover transition.")
    transition.status = "ingesting"
    await write_audit(db, action="project_requested", entity_type="project_request", actor_id=user.id, entity_id=request.id, detail={"name": request.name})
    await db.commit()
    await db.refresh(request)
    background_tasks.add_task(process_approved_project, transition.id, user.id)
    return project_request_payload(request, user)


@router.post("/admin/project-requests/{request_id}/decision")
async def decide_project_request(request_id: UUID, payload: ProjectRequestDecision, user: Annotated[User, Depends(require_role("admin"))]):
    raise HTTPException(
        status_code=409,
        detail="Initial project approval is no longer part of this workflow. Analysis starts when the departing member submits stage 2 sources; assign a reviewer after their answers are submitted.",
    )


@router.get("/projects", response_model=list[ProjectResponse])
async def projects(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("admin"))]):
    draft_project_ids = select(ProjectRequest.project_id).where(ProjectRequest.status == "draft", ProjectRequest.project_id.is_not(None))
    project_rows = list((await db.scalars(select(Project).where(Project.id.not_in(draft_project_ids)).order_by(Project.name))).all())
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
            team=project.team,
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


@router.get("/admin/incoming-candidates")
async def incoming_candidates(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    candidates = list((await db.scalars(select(User).where(User.role == "incoming").order_by(User.name))).all())
    return [{"id": str(candidate.id), "name": candidate.name, "email": candidate.email, "team": candidate.team} for candidate in candidates]


@router.post("/transitions", response_model=TransitionResponse, status_code=201)
async def create_transition(
    payload: TransitionCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    project = await db.get(Project, payload.project_id)
    if not project or not await db.get(User, payload.departing_user_id) or (payload.incoming_user_id and not await db.get(User, payload.incoming_user_id)):
        raise HTTPException(status_code=404, detail="Project or user not found")
    if payload.departing_user_id == payload.incoming_user_id:
        raise HTTPException(status_code=422, detail="The departing and incoming members must be different people")
    await require_project_admin(db, user, payload.project_id)
    departing_is_member = await db.scalar(select(ProjectRole.id).where(
        ProjectRole.project_id == payload.project_id,
        ProjectRole.user_id == payload.departing_user_id,
        ProjectRole.project_role == "departing",
    ))
    incoming_is_member = payload.incoming_user_id is None or await db.scalar(select(ProjectRole.id).where(
        ProjectRole.project_id == payload.project_id,
        ProjectRole.user_id == payload.incoming_user_id,
        ProjectRole.project_role == "incoming",
    ))
    if not departing_is_member or not incoming_is_member:
        raise HTTPException(status_code=422, detail="Departing and incoming users must be assigned to this project")
    allowed_kinds = {"github", "drive_export", "meeting_notes"}
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
        source_config = next(source.config for source in payload.sources if source.kind == kind)
        db.add(SourceConnection(transition_id=transition.id, kind=kind, access_level=access_level, config=source_config, status="configured"))
    await write_audit(db, action="transition_created", entity_type="transition", actor_id=user.id, entity_id=transition.id, transition_id=transition.id)
    await db.commit()
    await db.refresh(transition)
    return transition


@router.put("/admin/transitions/{transition_id}/reviewer")
async def assign_transition_reviewer(
    transition_id: UUID,
    payload: ReviewerAssignment,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_project_admin(db, user, transition.project_id)
    assignable_statuses = {"ingesting", "sources_ready", "awaiting_leaver_answers", "awaiting_reviewer_assignment", "review"}
    if transition.status not in assignable_statuses:
        raise HTTPException(status_code=409, detail="Reviewer assignment is available while a handover is active and before final reviewer approval.")
    reviewer = await db.get(User, payload.reviewer_id) if payload.reviewer_id else await db.scalar(select(User).where(User.email == payload.reviewer_email))
    if not reviewer:
        raise HTTPException(status_code=404, detail="No registered team lead reviewer was found.")
    if not reviewer or reviewer.id in {transition.departing_user_id, transition.incoming_user_id}:
        raise HTTPException(status_code=422, detail="Choose a team lead other than the departing and incoming members")
    if reviewer.role != "reviewer":
        raise HTTPException(status_code=422, detail="Choose an account registered as Team lead reviewer")
    project = await db.get(Project, transition.project_id)
    if project and project.team:
        registered_team_matches = reviewer.team.strip().casefold() == project.team.strip().casefold()
        assigned_teams = set((await db.scalars(
            select(Project.team)
            .join(ProjectRole, ProjectRole.project_id == Project.id)
            .where(ProjectRole.user_id == reviewer.id, ProjectRole.project_role == "reviewer", Project.team != "")
        )).all())
        has_matching_legacy_team = any(team.strip().casefold() == project.team.strip().casefold() for team in assigned_teams)
        has_conflicting_legacy_team = bool(assigned_teams) and not has_matching_legacy_team
        if (reviewer.team and not registered_team_matches) or (not reviewer.team and has_conflicting_legacy_team):
            raise HTTPException(status_code=422, detail=f"Choose a reviewer registered for the {project.team} team.")
        if not reviewer.team:
            reviewer.team = project.team
    previous_reviewer_id = transition.reviewer_id
    transition.reviewer_id = reviewer.id
    if transition.status == "awaiting_reviewer_assignment":
        transition.status = "review"
    reviewer_membership = await db.scalar(select(ProjectRole.id).where(
        ProjectRole.project_id == transition.project_id,
        ProjectRole.user_id == reviewer.id,
        ProjectRole.project_role == "reviewer",
    ))
    if not reviewer_membership:
        db.add(ProjectRole(project_id=transition.project_id, user_id=reviewer.id, project_role="reviewer"))
    await write_audit(
        db,
        action="reviewer_assigned",
        entity_type="transition",
        actor_id=user.id,
        entity_id=transition.id,
        transition_id=transition.id,
        detail={"reviewer_id": str(reviewer.id), "previous_reviewer_id": str(previous_reviewer_id) if previous_reviewer_id else None},
    )
    await db.commit()
    return {"transitionId": str(transition.id), "reviewer": {"id": str(reviewer.id), "name": reviewer.name, "email": reviewer.email, "team": reviewer.team}}


@router.put("/admin/transitions/{transition_id}/incoming")
async def assign_transition_incoming(
    transition_id: UUID,
    payload: IncomingAssignment,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_project_admin(db, user, transition.project_id)
    if transition.status not in {"published", "acknowledged"}:
        raise HTTPException(status_code=409, detail="Assign the incoming member after the reviewer publishes the approved handover.")
    incoming = await db.scalar(select(User).where(User.email == payload.incoming_email))
    if not incoming:
        raise HTTPException(status_code=404, detail="No account exists for that email. Ask the new joinee to sign up as an incoming member first.")
    if incoming.id in {transition.departing_user_id, transition.reviewer_id}:
        raise HTTPException(status_code=422, detail="Choose a different account than the departing member or reviewer")
    if incoming.role not in {"incoming", "admin"}:
        raise HTTPException(status_code=422, detail="This account must be registered as an incoming member")
    project = await db.get(Project, transition.project_id)
    incoming_team = (incoming.team or "").strip()
    project_team = (project.team or "").strip() if project else ""
    if not incoming_team:
        raise HTTPException(status_code=422, detail="This account has no joining team. Ask the new joinee to add their team before assigning a project.")
    if project_team and incoming_team.casefold() != project_team.casefold():
        raise HTTPException(status_code=422, detail=f"Choose a new joinee registered for the {project_team} team.")
    incoming.role = "incoming"
    transition.incoming_user_id = incoming.id
    transition.incoming_access_expires_at = datetime.now(UTC) + timedelta(days=30)
    membership = await db.scalar(select(ProjectRole.id).where(ProjectRole.project_id == transition.project_id, ProjectRole.user_id == incoming.id, ProjectRole.project_role == "incoming"))
    if not membership:
        db.add(ProjectRole(project_id=transition.project_id, user_id=incoming.id, project_role="incoming"))
    await write_audit(db, action="incoming_assigned", entity_type="transition", actor_id=user.id, entity_id=transition.id, transition_id=transition.id, detail={"incoming_id": str(incoming.id), "access_expires_at": transition.incoming_access_expires_at.isoformat(), "access_days": 30})
    await db.commit()
    return {"transitionId": str(transition.id), "incoming": {"id": str(incoming.id), "name": incoming.name, "email": incoming.email}, "accessExpiresAt": transition.incoming_access_expires_at}


@router.get("/reviewer/transitions")
async def reviewer_transitions(
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("reviewer"))],
):
    transitions = list((await db.scalars(
        select(Transition).where(Transition.reviewer_id == user.id, Transition.status.in_({"review", "awaiting_admin_approval"})).order_by(Transition.created_at.desc())
    )).all())
    result = []
    for transition in transitions:
        project = await db.get(Project, transition.project_id)
        departing = await db.get(User, transition.departing_user_id)
        incoming = await db.get(User, transition.incoming_user_id) if transition.incoming_user_id else None
        total = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter()))
        reviewed = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter(), KnowledgeClaim.review_state.in_({"approved", "edited", "rejected"})))
        blocking = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter(), KnowledgeClaim.trust_label.in_({"conflicting", "missing_evidence"}), KnowledgeClaim.review_state.not_in({"rejected", "approved"})))
        result.append({
            "id": str(transition.id), "project": project.name if project else "Project", "projectCode": project.name[:2].upper() if project else "PR",
            "status": "Approved" if transition.status in {"published", "acknowledged"} else "Awaiting project approval" if transition.status == "awaiting_project_approval" else "Waiting for leaver answers" if transition.status == "awaiting_leaver_answers" else "Awaiting reviewer assignment" if transition.status == "awaiting_reviewer_assignment" else "Awaiting admin approval" if transition.status == "awaiting_admin_approval" else "Review" if transition.status == "review" else "In progress",
            "departing": {"id": str(departing.id), "name": departing.name, "email": departing.email, "title": "Departing member", "initials": "".join(part[0] for part in departing.name.split()[:2]).upper()} if departing else {"id": "", "name": "Not assigned", "email": "", "title": "", "initials": "?"},
            "incoming": {"id": str(incoming.id), "name": incoming.name, "email": incoming.email, "title": transition.target_recipient_role, "initials": "".join(part[0] for part in incoming.name.split()[:2]).upper()} if incoming else {"id": "", "name": "Not assigned", "email": "", "title": "", "initials": "?"},
            "incomingRole": transition.target_recipient_role.replace("_", " ").title(),
            "accessReady": transition.status in {"published", "acknowledged"} and transition.incoming_user_id is not None,
            "teamAssigned": transition.incoming_user_id is not None,
            "claimCount": total or 0, "reviewedCount": reviewed or 0, "blockingCount": blocking or 0,
            "version": 1, "publishedAt": None,
        })
    return result


@router.post("/admin/transitions/{transition_id}/reviewer/revoke")
async def revoke_transition_reviewer(
    transition_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    user: Annotated[User, Depends(require_role("admin"))],
):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_project_admin(db, user, transition.project_id)
    if transition.status not in {"ingesting", "sources_ready", "awaiting_leaver_answers", "review", "awaiting_reviewer_assignment"}:
        raise HTTPException(status_code=409, detail="Reviewer access can only be changed before the reviewer gives final handover approval.")
    previous_reviewer_id = transition.reviewer_id
    if previous_reviewer_id:
        transition.reviewer_id = None
        if transition.status == "review":
            transition.status = "awaiting_reviewer_assignment"
        await write_audit(
            db,
            action="reviewer_unassigned",
            entity_type="transition",
            actor_id=user.id,
            entity_id=transition.id,
            transition_id=transition.id,
            detail={"reviewer_id": str(previous_reviewer_id)},
        )
    await db.commit()
    return {"transitionId": str(transition.id), "reviewer": None}


@router.get("/transitions/{transition_id}", response_model=TransitionResponse)
async def get_transition(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition)
    return transition


@router.get("/transitions/{transition_id}/summary")
async def transition_summary(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Transition not found")
    await require_transition_access(db, user, transition)
    project = await db.get(Project, transition.project_id)
    departing = await db.get(User, transition.departing_user_id)
    incoming = await db.get(User, transition.incoming_user_id) if transition.incoming_user_id else None
    total = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter()))
    reviewed = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter(), KnowledgeClaim.review_state.in_({"approved", "edited", "rejected"})))
    blocking = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter(), KnowledgeClaim.trust_label.in_({"conflicting", "missing_evidence"}), KnowledgeClaim.review_state.not_in({"rejected", "approved"})))
    access_days, access_expires_at = incoming_access_window(transition)
    return {
        "id": str(transition.id), "project": project.name if project else "Project", "projectCode": project.name[:2].upper() if project else "PR",
        "status": "Approved" if transition.status in {"published", "acknowledged"} else "Awaiting project approval" if transition.status == "awaiting_project_approval" else "Waiting for leaver answers" if transition.status == "awaiting_leaver_answers" else "Awaiting reviewer assignment" if transition.status == "awaiting_reviewer_assignment" else "Awaiting admin approval" if transition.status == "awaiting_admin_approval" else "Review" if transition.status == "review" else "In progress",
        "departing": {"id": str(departing.id), "name": departing.name, "email": departing.email, "title": "Departing member", "initials": "".join(part[0] for part in departing.name.split()[:2]).upper()} if departing else {"id": "", "name": "Not assigned", "email": "", "title": "", "initials": "?"},
        "incoming": {"id": str(incoming.id), "name": incoming.name, "email": incoming.email, "title": transition.target_recipient_role, "initials": "".join(part[0] for part in incoming.name.split()[:2]).upper()} if incoming else {"id": "", "name": "Not assigned", "email": "", "title": "", "initials": "?"},
        "incomingRole": transition.target_recipient_role.replace("_", " ").title(), "accessDaysRemaining": access_days, "accessExpiresAt": access_expires_at,
        "accessReady": transition.status in {"published", "acknowledged"} and transition.incoming_user_id is not None and access_days > 0, "teamAssigned": transition.incoming_user_id is not None,
        "claimCount": total or 0, "reviewedCount": reviewed or 0, "blockingCount": blocking or 0,
        "version": 1, "publishedAt": None,
    }


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
            select(Transition).where(Transition.project_id.in_(supervised_project_ids), Transition.id.not_in(select(ProjectRequest.transition_id).where(ProjectRequest.status == "draft", ProjectRequest.transition_id.is_not(None)))).order_by(Transition.created_at.desc())
        )).all())
        return DashboardResponse(departing=transitions, onboarding=[])
    transitions = list((await db.scalars(select(Transition).order_by(Transition.created_at.desc()))).all())
    departing = [item for item in transitions if item.departing_user_id == user.id]
    now = datetime.now(UTC)
    onboarding = [item for item in transitions if item.incoming_user_id == user.id and item.status in {"published", "acknowledged"} and item.incoming_access_expires_at is not None and item.incoming_access_expires_at > now]
    return DashboardResponse(departing=departing, onboarding=onboarding)


@router.get("/admin/dashboard")
async def admin_dashboard(db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("admin"))]):
    project_rows = list((await db.scalars(
        select(Project).where(Project.id.not_in(select(ProjectRequest.project_id).where(ProjectRequest.status == "draft", ProjectRequest.project_id.is_not(None)))).order_by(Project.team, Project.name)
    )).all())
    transitions = list((await db.scalars(
        select(Transition).where(Transition.id.not_in(select(ProjectRequest.transition_id).where(ProjectRequest.status == "draft", ProjectRequest.transition_id.is_not(None)))).order_by(Transition.created_at.desc())
    )).all())
    reviewer_users = list((await db.scalars(select(User).where(User.role == "reviewer").order_by(User.name))).all())
    reviewer_team_rows = list((await db.execute(
        select(ProjectRole.user_id, Project.team)
        .join(Project, Project.id == ProjectRole.project_id)
        .where(ProjectRole.project_role == "reviewer")
    )).all())
    reviewer_teams: dict[UUID, set[str]] = {}
    for reviewer_id, team_name in reviewer_team_rows:
        if team_name and team_name.strip():
            reviewer_teams.setdefault(reviewer_id, set()).add(team_name.strip())
    project_payload = []
    for project in project_rows:
        memberships = list((await db.execute(
            select(ProjectRole, User).join(User, User.id == ProjectRole.user_id).where(ProjectRole.project_id == project.id)
        )).all())
        supervisor = next((member for role, member in memberships if role.user_id == user.id and role.project_role == "admin"), user)
        project_payload.append({
            "id": str(project.id), "code": project.name[:2].upper(), "name": project.name, "team": project.team,
            "supervisor": supervisor.name,
            "members": [{"id": str(member.id), "name": member.name, "title": membership.project_role.replace("_", " ").title(), "initials": "".join(part[0] for part in member.name.split()[:2]).upper(), "involvement": membership.project_role.replace("_", " ").title()} for membership, member in memberships if member.id != supervisor.id],
        })

    transition_payload = []
    for transition in transitions:
        project = await db.get(Project, transition.project_id)
        departing = await db.get(User, transition.departing_user_id)
        incoming = await db.get(User, transition.incoming_user_id) if transition.incoming_user_id else None
        reviewer = await db.get(User, transition.reviewer_id) if transition.reviewer_id else None
        total = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter()))
        reviewed = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter(), KnowledgeClaim.review_state.in_({"approved", "edited", "rejected"})))
        blocking = await db.scalar(select(func.count()).select_from(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition.id, reviewable_claim_filter(), KnowledgeClaim.trust_label.in_({"conflicting", "missing_evidence"}), KnowledgeClaim.review_state.not_in({"rejected", "approved"})))
        project_team = project.team.strip() if project and project.team else ""
        def reviewer_teams_for(member: User) -> set[str]:
            if member.team and member.team.strip():
                return {member.team.strip()}
            return set(reviewer_teams.get(member.id, set()))

        team_reviewers = [
            member for member in reviewer_users
            if member.id not in {transition.departing_user_id, transition.incoming_user_id}
            and (not project_team or not reviewer_teams_for(member) or any(team.casefold() == project_team.casefold() for team in reviewer_teams_for(member)))
        ]
        transition_payload.append({
            "id": str(transition.id), "project": project.name if project else "Project", "projectCode": project.name[:2].upper() if project else "PR", "team": project_team,
            "status": "Approved" if transition.status in {"published", "acknowledged"} else "Awaiting project approval" if transition.status == "awaiting_project_approval" else "Waiting for leaver answers" if transition.status == "awaiting_leaver_answers" else "Awaiting reviewer assignment" if transition.status == "awaiting_reviewer_assignment" else "Awaiting admin approval" if transition.status == "awaiting_admin_approval" else "Review" if transition.status == "review" else "In progress",
            "departing": {"id": str(departing.id), "name": departing.name, "email": departing.email, "title": "Departing member", "initials": "".join(part[0] for part in departing.name.split()[:2]).upper()} if departing else {"id": "", "name": "Not assigned", "email": "", "title": "", "initials": "?"},
            "incoming": {"id": str(incoming.id), "name": incoming.name, "email": incoming.email, "title": transition.target_recipient_role, "initials": "".join(part[0] for part in incoming.name.split()[:2]).upper()} if incoming else {"id": "", "name": "Not assigned", "email": "", "title": "", "initials": "?"},
            "accessDaysRemaining": incoming_access_window(transition)[0], "accessExpiresAt": transition.incoming_access_expires_at,
            "accessReady": transition.status in {"published", "acknowledged"} and transition.incoming_user_id is not None and incoming_access_window(transition)[0] > 0, "teamAssigned": transition.incoming_user_id is not None,
            "claimCount": total or 0, "reviewedCount": reviewed or 0, "blockingCount": blocking or 0,
            "version": 1, "publishedAt": None,
            "reviewer": {"id": str(reviewer.id), "name": reviewer.name, "email": reviewer.email} if reviewer else None,
            "reviewerCandidates": [
                {"id": str(member.id), "name": member.name, "email": member.email, "role": member.role, "teams": sorted(reviewer_teams_for(member))}
                for member in team_reviewers
            ],
        })
    return {"projects": project_payload, "transitions": transition_payload}


