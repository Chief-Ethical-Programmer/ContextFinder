import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.auth import me_router
from app.api.v1.auth import router as auth_router
from app.api.v1.claims import router as claims_router
from app.api.v1.exit_questions import router as exit_router
from app.api.v1.foundation import router as foundation_router
from app.api.v1.handover import router as handover_router
from app.api.v1.ingestion import router as ingestion_router
from app.api.v1.internal import router as internal_router
from app.api.v1.review import router as review_router
from app.config import get_settings
from app.core.errors import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.middleware import RequestContextMiddleware
from app.db.session import engine

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await engine.dispose()


app = FastAPI(title="ContextFinder API", version="0.1.0", root_path="", lifespan=lifespan)
settings = get_settings()
app.add_middleware(RequestContextMiddleware)
app.add_exception_handler(Exception, unhandled_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Service-Token"],
)
app.include_router(auth_router, prefix="/api/v1")
app.include_router(me_router, prefix="/api/v1")
app.include_router(foundation_router, prefix="/api/v1")
app.include_router(ingestion_router, prefix="/api/v1")
app.include_router(claims_router, prefix="/api/v1")
app.include_router(exit_router, prefix="/api/v1")
app.include_router(review_router, prefix="/api/v1")
app.include_router(handover_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/api/v1")


@app.get("/api/v1/health", tags=["ops"])
async def health():
    return {"status": "ok"}


@app.get("/api/v1/ready", tags=["ops"])
async def ready():
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok"}
    except SQLAlchemyError as exc:
        logger.warning("Readiness check failed: %s", exc)
        return {"status": "not_ready", "database": "unavailable"}
