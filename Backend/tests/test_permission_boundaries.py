import asyncio

import pytest
from fastapi import HTTPException

from app.core.deps import require_role
from app.db.models import User


def test_review_claim_dependency_is_admin_only():
    dependency = require_role("admin")
    allowed = User(email="admin@test", name="Admin", role="admin", password_hash="x")
    assert asyncio.run(dependency(allowed)) is allowed


def test_incoming_user_cannot_use_review_claim_dependency():
    dependency = require_role("admin")
    incoming = User(email="incoming@test", name="Incoming", role="incoming", password_hash="x")
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependency(incoming))
    assert error.value.status_code == 403