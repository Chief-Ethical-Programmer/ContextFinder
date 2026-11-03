import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.ingestion import pipeline_status
from app.api.v1.review import bulk_approve, reviewer_claim, reviewer_transition
from app.db.models import KnowledgeClaim, Transition


class FakeScalars:
    def all(self):
        return []


class FakeDb:
    def __init__(self, *, claim=None, transition=None):
        self.claim = claim
        self.transition = transition

    async def get(self, model, _identifier):
        if model is KnowledgeClaim:
            return self.claim
        if model is Transition:
            return self.transition
        return None

    async def scalars(self, _query):
        return FakeScalars()


def test_reviewer_claim_rejects_unassigned_reviewer_with_http_error():
    claim = SimpleNamespace(transition_id=uuid4())
    transition = SimpleNamespace(reviewer_id=uuid4(), status="review")
    user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as error:
        asyncio.run(reviewer_claim(FakeDb(claim=claim, transition=transition), uuid4(), user))

    assert error.value.status_code == 404


def test_reviewer_transition_rejects_unassigned_reviewer_with_http_error():
    transition = SimpleNamespace(reviewer_id=uuid4())
    user = SimpleNamespace(id=uuid4())

    with pytest.raises(HTTPException) as error:
        asyncio.run(reviewer_transition(FakeDb(transition=transition), uuid4(), user))

    assert error.value.status_code == 404


def test_bulk_approve_returns_conflict_for_closed_review():
    transition = SimpleNamespace(reviewer_id=uuid4(), status="published")
    user = SimpleNamespace(id=transition.reviewer_id)

    with pytest.raises(HTTPException) as error:
        asyncio.run(bulk_approve(uuid4(), {}, FakeDb(transition=transition), user))

    assert error.value.status_code == 409


def test_pipeline_status_authorizes_assigned_reviewer():
    transition_id = uuid4()
    reviewer_id = uuid4()
    transition = SimpleNamespace(id=transition_id, reviewer_id=reviewer_id, departing_user_id=None, incoming_user_id=None)
    user = SimpleNamespace(id=reviewer_id, role="reviewer")

    result = asyncio.run(pipeline_status(transition_id, FakeDb(transition=transition), user))

    assert result == {"transitionId": transition_id, "stages": []}


