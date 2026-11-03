from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ProjectRole, Transition, User


async def is_project_admin(db: AsyncSession, user_id: UUID, project_id: UUID) -> bool:
    role_id = await db.scalar(
        select(ProjectRole.id).where(
            ProjectRole.project_id == project_id,
            ProjectRole.user_id == user_id,
            ProjectRole.project_role == "admin",
        )
    )
    return role_id is not None


async def require_project_admin(db: AsyncSession, user: User, project_id: UUID) -> None:
    if user.role != "admin" or not await is_project_admin(db, user.id, project_id):
        raise HTTPException(status_code=404, detail="Project not found")


async def require_transition_access(
    db: AsyncSession,
    user: User,
    transition: Transition,
    *,
    admin_only: bool = False,
) -> None:
    if user.role == "reviewer":
        if not admin_only and user.id in {transition.reviewer_id, transition.departing_user_id, transition.incoming_user_id}:
            return
        raise HTTPException(status_code=404, detail="Transition not found")
    if user.role == "admin":
        await require_project_admin(db, user, transition.project_id)
        return
    if admin_only or user.id not in {transition.departing_user_id, transition.incoming_user_id}:
        raise HTTPException(status_code=404, detail="Transition not found")
    if user.id == transition.incoming_user_id and (
        transition.incoming_access_expires_at is None
        or transition.incoming_access_expires_at <= datetime.now(UTC)
    ):
        raise HTTPException(status_code=404, detail="This onboarding access has expired")
