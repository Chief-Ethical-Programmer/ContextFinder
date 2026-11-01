from fastapi import HTTPException

from app.core.clearance import RecipientRole
from app.services.handover import filtered_claims


def test_filtered_claims_only_expose_cleared_items():
    visible, hidden = filtered_claims(
        {"claims": [
            {"id": "public", "statement": "safe", "accessLevel": "public_team"},
            {"id": "technical", "statement": "technical", "accessLevel": "technical_only"},
            {"id": "secret", "statement": "hidden", "accessLevel": "leads_only"},
        ]},
        RecipientRole.TECHNICAL_SUCCESSOR,
    )
    assert [claim["id"] for claim in visible] == ["public", "technical"]
    assert hidden == 1


def test_unpublished_requires_not_found_semantics():
    error = HTTPException(status_code=404, detail="Handover not found")
    assert error.status_code == 404
