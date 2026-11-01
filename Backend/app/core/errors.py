import logging
import uuid

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def problem(code: str, message: str, details: dict | None = None) -> dict:
    return {"code": code, "message": message, "details": details or {}}


async def http_exception_handler(_: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(status_code=exc.status_code, content=problem("http_error", message, detail))


async def validation_exception_handler(_: Request, exc: RequestValidationError):
    # Pydantic errors may include non-JSON-serializable objects in `ctx` (for
    # example, the ValueError raised by a field validator). Return only the
    # display-safe fields so invalid input stays a 422 instead of becoming a 500.
    errors = [
        {
            "location": list(error.get("loc", ())),
            "message": error.get("msg", "Invalid value"),
            "type": error.get("type", "value_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content=problem("validation_error", "Check the highlighted information and try again.", {"errors": errors}))


async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    logger.exception("Unhandled request failure request_id=%s", request_id, exc_info=exc)
    return JSONResponse(status_code=500, content=problem("internal_error", "Internal server error", {"requestId": request_id}))
