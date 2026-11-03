"""Explicitly reset the demo workspace to one admin and no project data.

Run manually after migrations with: python -m app.seed.reset_workspace
This is intentionally not part of API startup.
"""
import asyncio
import os

from sqlalchemy import delete, select

from app.db.models import (
    AccessRequest,
    Acknowledgement,
    AuditEvent,
    ClaimEvidence,
    ClaimVersion,
    ConflictPair,
    Dependency,
    ExitAnswer,
    ExitQuestion,
    HandoverVersion,
    KnowledgeClaim,
    PipelineRun,
    Project,
    ProjectRequest,
    ProjectRole,
    RecipientAccess,
    ReviewEvent,
    RoleView,
    SourceConnection,
    SourceRecord,
    Transition,
    User,
)
from app.db.session import SessionLocal


async def main() -> None:
    configured_email = os.getenv("INITIAL_ADMIN_EMAIL", "admin@contextfinder.demo").strip().lower()
    dependent_models = [
        AuditEvent, Acknowledgement, AccessRequest, RecipientAccess, RoleView, HandoverVersion,
        ExitAnswer, ExitQuestion, ReviewEvent, ClaimVersion, Dependency,
        ConflictPair, ClaimEvidence, KnowledgeClaim, SourceRecord, SourceConnection,
        PipelineRun, Transition, ProjectRequest, ProjectRole, Project,
    ]
    async with SessionLocal() as db, db.begin():
        for model in dependent_models:
            await db.execute(delete(model))
        admin = await db.scalar(select(User).where(User.email == configured_email, User.role == "admin"))
        if admin is None:
            admin = await db.scalar(select(User).where(User.role == "admin").order_by(User.email).limit(1))
        if not admin:
            # Only create the fallback account when no admin exists. Existing
            # credentials are preserved during a workspace reset.
            from app.core.security import hash_password

            password = os.getenv("INITIAL_ADMIN_PASSWORD", "admin123")
            if len(password) < 8:
                raise SystemExit("INITIAL_ADMIN_PASSWORD must be at least 8 characters")
            admin = User(
                name="Workspace Admin",
                email=configured_email,
                password_hash=hash_password(password),
                role="admin",
            )
            db.add(admin)
        await db.flush()
        await db.execute(delete(User).where(User.id != admin.id))
    print(f"Workspace reset. Preserved admin login: {admin.email}")


if __name__ == "__main__":
    asyncio.run(main())
