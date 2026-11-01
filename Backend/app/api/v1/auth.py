import hmac
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.deps import current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.models import User
from app.db.session import get_db
from app.schemas import DemoSwitchRequest, LoginRequest, SignupRequest, TokenResponse, UserResponse
from app.services.audit import write_audit

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


async def token_for(db: AsyncSession, user: User) -> TokenResponse:
    await write_audit(db, action="login", entity_type="user", actor_id=user.id, entity_id=user.id)
    await db.commit()
    return TokenResponse(access_token=create_access_token(str(user.id), user.role), user=user)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    user = await db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return await token_for(db, user)


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    settings = get_settings()
    if payload.role == "admin":
        configured_code = settings.admin_signup_code
        if not configured_code:
            raise HTTPException(status_code=403, detail="Admin registration is disabled. Ask a workspace admin for access.")
        if not payload.admin_signup_code or not hmac.compare_digest(payload.admin_signup_code, configured_code):
            raise HTTPException(status_code=403, detail="The admin invitation code is invalid")

    existing = await db.scalar(select(User.id).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    try:
        await db.flush()
        await write_audit(db, action="account_created", entity_type="user", actor_id=user.id, entity_id=user.id, detail={"role": user.role})
        await db.commit()
        await db.refresh(user)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists. Sign in instead.") from exc
    return user


@router.post("/demo-switch", response_model=TokenResponse)
async def demo_switch(payload: DemoSwitchRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    if not get_settings().demo_mode:
        raise HTTPException(status_code=404, detail="Demo mode is disabled")
    user = await db.scalar(select(User).where(User.role == payload.role).order_by(User.email))
    if not user:
        raise HTTPException(status_code=404, detail="No demo user for role")
    return await token_for(db, user)


@me_router.get("/me", response_model=UserResponse)
async def me(user: Annotated[User, Depends(current_user)]):
    return user
