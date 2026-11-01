from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.db.models import KnowledgeClaim
from app.services.review import review_claim


@pytest.mark.asyncio
async def test_blocking_claim_cannot_be_approved_without_resolution():
    claim = KnowledgeClaim(
        transition_id=uuid4(),
        type="task",
        statement="Conflicting status",
        subject_key="terraform_migration",
        trust_label="conflicting",
        trust_reason="conflict",
        access_level="technical_only",
        origin="system",
        review_state="proposed",
        current_version=1,
        flags={},
    )
    with pytest.raises(HTTPException) as error:
        await review_claim(None, claim, uuid4(), "approve")
    assert error.value.status_code == 422
