from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import require_transition_access
from app.core.clearance import RecipientRole, may_see
from app.core.deps import current_user, require_role
from app.db.models import (
    AuditEvent,
    ClaimEvidence,
    ExitAnswer,
    ExitQuestion,
    KnowledgeClaim,
    SourceConnection,
    SourceRecord,
    Transition,
    User,
)
from app.db.session import get_db
from app.services.exit_questions import answer_question, generate_questions

router = APIRouter(prefix="/exit", tags=["exit"])


@router.get("/{transition_id}/evidence")
async def exit_evidence(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition or user.role != "departing" or user.id != transition.departing_user_id:
        raise HTTPException(status_code=404, detail="Exit evidence not found")
    await require_transition_access(db, user, transition)
    rows = list((await db.execute(
        select(ClaimEvidence, SourceRecord, SourceConnection, KnowledgeClaim)
        .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
        .join(SourceConnection, SourceRecord.connection_id == SourceConnection.id)
        .join(KnowledgeClaim, ClaimEvidence.claim_id == KnowledgeClaim.id)
        .where(KnowledgeClaim.transition_id == transition_id)
    )).all())
    source_names = {"github": "GitHub", "slack_export": "Slack", "slack_leads_export": "Slack", "drive_export": "Drive", "meeting_notes": "Meeting notes"}
    return [{"id": str(item.id), "source": source_names.get(connection.kind, connection.kind), "author": source.author, "happenedAt": source.occurred_at, "excerpt": item.excerpt, "href": source.url} for item, source, connection, claim in rows if may_see(RecipientRole.TECHNICAL_SUCCESSOR, claim.access_level) and may_see(RecipientRole.TECHNICAL_SUCCESSOR, source.access_level)]


@router.get("/{transition_id}/questions")
async def questions(transition_id: UUID, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(current_user)]):
    transition = await db.get(Transition, transition_id)
    if not transition:
        raise HTTPException(status_code=404, detail="Exit questions not found")
    if user.role != "departing" and user.role != "admin":
        raise HTTPException(status_code=404, detail="Exit questions not found")
    await require_transition_access(db, user, transition, admin_only=user.role == "admin")
    await generate_questions(db, transition_id)
    await db.commit()
    rows = list((await db.scalars(select(ExitQuestion).where(ExitQuestion.transition_id == transition_id).order_by(ExitQuestion.id))).all())
    answers = list((await db.scalars(
        select(ExitAnswer).join(ExitQuestion, ExitAnswer.question_id == ExitQuestion.id)
        .where(ExitQuestion.transition_id == transition_id).order_by(ExitAnswer.created_at.desc())
    )).all())
    latest_answer = {}
    for answer in answers:
        latest_answer.setdefault(answer.question_id, answer)
    result = []
    for question in rows:
        claim = await db.get(KnowledgeClaim, question.claim_id)
        if not claim or (user.role != "admin" and not may_see(RecipientRole.TECHNICAL_SUCCESSOR, claim.access_level)):
            continue
        evidence_ids = list((await db.scalars(select(ClaimEvidence.id).where(ClaimEvidence.claim_id == claim.id))).all())
        answer = latest_answer.get(question.id)
        answer_status = None
        if answer:
            answer_status = {"answer": "submitted", "dont_know": "dont-know", "skipped": "skipped", "draft": "draft"}.get(answer.kind, "draft")
        result.append({
            "id": question.id,
            "transition_id": question.transition_id,
            "claim_id": question.claim_id,
            "prompt": question.prompt,
            "system_finding": question.system_finding,
            "trust_label": question.trust_label,
            "evidenceIds": [str(value) for value in evidence_ids],
            "answer": answer.body if answer else None,
            "answerStatus": answer_status,
            "answerSubmitted": question.status in {"answered", "skipped"},
        })
    return result


async def submit_answer(question_id: UUID, body: dict, submit: bool, db: AsyncSession, user: User):
    question = await db.get(ExitQuestion, question_id)
    if not question:
        raise HTTPException(status_code=404, detail="Exit question not found")
    transition = await db.get(Transition, question.transition_id)
    if not transition or user.role != "departing" or user.id != transition.departing_user_id:
        raise HTTPException(status_code=404, detail="Exit question not found")
    answer = await answer_question(db, question, user, str(body.get("body", "")), str(body.get("kind", "draft" if not submit else "answer")), submit)
    if submit and transition.status in {"awaiting_leaver_answers", "review"}:
        remaining = await db.scalar(
            select(ExitQuestion.id)
            .where(ExitQuestion.transition_id == transition.id, ExitQuestion.status.not_in({"answered", "skipped"}))
            .limit(1)
        )
        if remaining is None:
            transition.status = "review" if transition.reviewer_id else "awaiting_reviewer_assignment"
            db.add(AuditEvent(
                actor_id=user.id,
                action="exit_answers_submitted",
                entity_type="transition",
                entity_id=transition.id,
                transition_id=transition.id,
                detail={"submitted_questions": True},
            ))
    await db.commit()
    return answer


@router.put("/questions/{question_id}/answer")
async def draft_answer(question_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("departing"))]):
    return await submit_answer(question_id, body, False, db, user)


@router.post("/questions/{question_id}/answer")
async def final_answer(question_id: UUID, body: dict, db: Annotated[AsyncSession, Depends(get_db)], user: Annotated[User, Depends(require_role("departing"))]):
    return await submit_answer(question_id, body, True, db, user)
