import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.models import Base, Project, ProjectRole, User
from app.db.session import SessionLocal, engine

DEMO_PASSWORD = "contextfinder-demo"
USERS = [
    ("admin@cloudcart.demo", "Morgan Admin", "admin"),
    ("alex@cloudcart.demo", "Alex Departing", "departing"),
    ("ryan@cloudcart.demo", "Ryan Incoming", "incoming"),
]


async def seed() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        users = {}
        for email, name, role in USERS:
            user = await db.scalar(select(User).where(User.email == email))
            if not user:
                user = User(email=email, name=name, role=role, password_hash=hash_password(DEMO_PASSWORD))
                db.add(user)
                await db.flush()
            users[role] = user
        cloudcart = await db.scalar(select(Project).where(Project.name == "CloudCart"))
        if not cloudcart:
            cloudcart = Project(name="CloudCart", description="Synthetic AWS online shop handover demo", synthetic=True)
            db.add(cloudcart)
            await db.flush()
        empty = await db.scalar(select(Project).where(Project.name == "Empty Team Demo"))
        if not empty:
            empty = Project(name="Empty Team Demo", description="Synthetic empty-team dashboard state", synthetic=True)
            db.add(empty)
            await db.flush()
        role_assignments = [
            (cloudcart.id, users["admin"].id, "admin"),
            (cloudcart.id, users["departing"].id, "departing"),
            (cloudcart.id, users["incoming"].id, "incoming"),
            (empty.id, users["admin"].id, "admin"),
        ]
        for project_id, user_id, project_role in role_assignments:
            existing = await db.scalar(select(ProjectRole.id).where(
                ProjectRole.project_id == project_id,
                ProjectRole.user_id == user_id,
                ProjectRole.project_role == project_role,
            ))
            if not existing:
                db.add(ProjectRole(project_id=project_id, user_id=user_id, project_role=project_role))
        await db.commit()
    print("Seed complete. Demo password:", DEMO_PASSWORD)


if __name__ == "__main__":
    asyncio.run(seed())
