import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    AuditEvent,
    ClaimEvidence,
    ExitAnswer,
    ExitQuestion,
    KnowledgeClaim,
    Project,
    SourceConnection,
    SourceRecord,
    Transition,
    User,
)
from app.llm.provider import get_llm_client

TARGET_LABELS = {"conflicting", "unverified", "missing_evidence"}
MAX_EXIT_QUESTIONS = 12
MAX_SOLUTION_DOCS = 3
MAX_SOLUTION_CHARS_PER_DOC = 1_600


def _solution_context(records: list[tuple[SourceRecord, str]], claim: KnowledgeClaim) -> list[dict[str, str]]:
    tokens = set(re.findall(r"[a-z0-9]{4,}", f"{claim.statement} {claim.trust_reason}".casefold()))
    artifact = (claim.flags or {}).get("referencedArtifact") or {}
    tokens.update(re.findall(r"[a-z0-9]{4,}", str(artifact.get("name", "")).casefold()))
    ranked: list[tuple[int, int, SourceRecord, str]] = []
    for record, connection_kind in records:
        if connection_kind != "drive_export":
            continue
        metadata = record.metadata_json or {}
        filename = str(metadata.get("filename") or metadata.get("relative_path") or record.author)
        lowered = filename.casefold()
        score = sum(token in lowered for token in tokens)
        if any(word in lowered for word in ("solution", "proposal", "handover", "architecture", "design")):
            score += 5
        if lowered.endswith(".pdf"):
            score += 2
        ranked.append((-score, len(record.text), record, filename))

    result: list[dict[str, str]] = []
    used_chars = 0
    for _, _, record, filename in sorted(ranked, key=lambda item: (item[0], item[1], item[3].casefold())):
        pieces = [piece.strip() for piece in re.split(r"(?<=[.!?])\s+|\n+", record.text) if piece.strip()]
        scored = sorted(
            ((-sum(token in piece.casefold() for token in tokens), index, piece) for index, piece in enumerate(pieces)),
            key=lambda item: (item[0], item[1]),
        )
        selected_pieces: set[int] = set()
        excerpt_parts: list[str] = []
        excerpt_size = 0
        for _, index, piece in scored:
            if excerpt_size + len(piece) + 1 > MAX_SOLUTION_CHARS_PER_DOC:
                continue
            selected_pieces.add(index)
            excerpt_size += len(piece) + 1
            if excerpt_size >= MAX_SOLUTION_CHARS_PER_DOC * 0.8:
                break
        if selected_pieces:
            excerpt_parts = [piece for index, piece in enumerate(pieces) if index in selected_pieces]
        excerpt = "\n".join(excerpt_parts).strip() or record.text[:MAX_SOLUTION_CHARS_PER_DOC].strip()
        if not excerpt:
            continue
        if used_chars + len(excerpt) > 4_000:
            continue
        result.append({"document": filename, "text": excerpt})
        used_chars += len(excerpt)
        if len(result) >= MAX_SOLUTION_DOCS:
            break
    return result


async def generate_questions(db: AsyncSession, transition_id: UUID) -> int:
    existing = await db.scalar(select(ExitQuestion.id).where(ExitQuestion.transition_id == transition_id).limit(1))
    if existing:
        return 0
    claims = list((await db.scalars(select(KnowledgeClaim).where(
        KnowledgeClaim.transition_id == transition_id,
        KnowledgeClaim.trust_label.in_(TARGET_LABELS),
    ))).all())
    priority = {"conflicting": 0, "missing_evidence": 1, "unverified": 2}
    claims.sort(key=lambda claim: (priority.get(claim.trust_label, 3), claim.created_at.isoformat() if claim.created_at else ""))
    claims = claims[:MAX_EXIT_QUESTIONS]
    if not claims:
        return 0

    transition = await db.get(Transition, transition_id)
    project = await db.get(Project, transition.project_id) if transition else None
    project_brief = (project.description or "")[:4_000] if project else ""

    related_claims = list((await db.scalars(select(KnowledgeClaim).where(KnowledgeClaim.transition_id == transition_id))).all())
    claims_by_subject: dict[str, list[KnowledgeClaim]] = {}
    for related in related_claims:
        claims_by_subject.setdefault(related.subject_key, []).append(related)

    evidence_rows = list((await db.execute(
        select(ClaimEvidence, SourceRecord)
        .join(SourceRecord, ClaimEvidence.source_record_id == SourceRecord.id)
        .where(ClaimEvidence.claim_id.in_([claim.id for claim in related_claims]))
    )).all())
    evidence_by_claim: dict[UUID, list[dict[str, str]]] = {}
    for evidence, source in evidence_rows:
        evidence_by_claim.setdefault(evidence.claim_id, []).append({
            "source": source.author or source.kind,
            "url": source.url or "",
            "excerpt": evidence.excerpt[:600],
        })

    source_rows = list((await db.execute(
        select(SourceRecord, SourceConnection.kind)
        .join(SourceConnection, SourceRecord.connection_id == SourceConnection.id)
        .where(SourceConnection.transition_id == transition_id)
    )).all())
    cases: list[dict] = []
    for claim in claims:
        competing_claims = [
            {
                "statement": other.statement,
                "status": other.status_value or "unspecified",
                "evidence": evidence_by_claim.get(other.id, [])[:2],
            }
            for other in claims_by_subject.get(claim.subject_key, [])
            if other.id != claim.id and other.review_state != "system_rejected"
        ][:5] if claim.trust_label == "conflicting" else []
        artifact = (claim.flags or {}).get("referencedArtifact") or {}
        context = {
            "project_brief_context_only": project_brief,
            "trust_label": claim.trust_label,
            "finding": claim.trust_reason,
            "status_value": claim.status_value,
            "competing_claims": competing_claims,
            "missing_artifact": artifact.get("name") if artifact and not artifact.get("resolved", True) else None,
            "evidence": evidence_by_claim.get(claim.id, [])[:4],
            "proposed_solution_documents": _solution_context(source_rows, claim),
        }
        cases.append({
            "claim_id": str(claim.id),
            "statement": claim.statement,
            "type": claim.type,
            **context,
        })

    questions = await get_llm_client().write_exit_questions(cases)
    for claim in claims:
        db.add(ExitQuestion(
            transition_id=transition_id,
            claim_id=claim.id,
            prompt=questions[str(claim.id)],
            system_finding=claim.trust_reason,
            trust_label=claim.trust_label,
        ))
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
            response = "I don't know." if kind == "dont_know" else body.strip()
            original.flags = {**(original.flags or {}), "departingResponse": response}
        db.add(AuditEvent(actor_id=user.id, action="exit_answer", entity_type="exit_question", entity_id=question.id, transition_id=question.transition_id, detail={"kind": kind}))
    await db.flush()
    return answer
