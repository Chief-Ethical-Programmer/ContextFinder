from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import AuditEvent, ClaimEvidence, ExitAnswer, ExitQuestion, KnowledgeClaim, User
from app.llm.fake_client import FakeClient
from app.llm.schemas import ClaimLite

TARGET_LABELS = {"conflicting", "unverified", "missing_evidence"}


async def generate_questions(db: AsyncSession, transition_id: UUID) -> int:
    existing = await db.scalar(select(ExitQuestion.id).where(ExitQuestion.transition_id == transition_id).limit(1))
    if existing:
        return 0
    claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id, KnowledgeClaim.trust_label.in_(TARGET_LABELS)))).all())
    client = FakeClient()
    for claim in claims:
        prompt = await client.write_exit_question(ClaimLite(id=claim.id, statement=claim.statement, type=claim.type, evidence_ids=[]))
        db.add(ExitQuestion(transition_id=transition_id, claim_id=claim.id, prompt=prompt, system_finding=claim.trust_reason, trust_label=claim.trust_label))
    await db.flush()
    return len(claims)


async def answer_question(db: AsyncSession, question: ExitQuestion, user: User, body: str, kind: str, submit: bool) -> ExitAnswer:
    if kind not in {"answer", "dont_know", "skipped", "draft"}:
        raise ValueError("Unsupported answer kind")
    answer = ExitAnswer(question_id=question.id, answered_by=user.id, body=body, kind=kind)
    db.add(answer)
    if submit and kind != "draft":
        question.status = "skipped" if kind == "skipped" else "answered"
        original = await db.get(KnowledgeClaim, question.claim_id)
        if original and kind != "skipped":
            stated_claim = KnowledgeClaim(
                transition_id=question.transition_id,
                type=original.type,
                statement=f"Leaver response: {body or kind}.",
                subject_key=original.subject_key,
                status_value=None,
                trust_label="unverified",
                trust_reason="Stated by the departing member; reviewer confirmation is required.",
                access_level=original.access_level,
                origin="leaver",
                review_state="proposed",
                current_version=1,
                flags={"sourceQuestionId": str(question.id), "answerKind": kind, "originalClaimId": str(original.id)},
            )
            db.add(stated_claim)
            await db.flush()
            answer.created_claim_id = stated_claim.id
            original_evidence = list((await db.scalars(select(ClaimEvidence).where(ClaimEvidence.claim_id == original.id))).all())
            for evidence in original_evidence:
                db.add(ClaimEvidence(claim_id=stated_claim.id, source_record_id=evidence.source_record_id, excerpt=evidence.excerpt, resolved=evidence.resolved, note="Inherited from exit-question context."))
        db.add(AuditEvent(actor_id=user.id, action="exit_answer", entity_type="exit_question", entity_id=question.id, transition_id=question.transition_id, detail={"kind": kind}))
    await db.flush()
    return answer
