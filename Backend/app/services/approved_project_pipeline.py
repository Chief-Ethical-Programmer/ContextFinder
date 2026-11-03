import logging
from uuid import UUID

from app.db.models import Transition
from app.db.session import SessionLocal
from app.services.audit import write_audit
from app.services.exit_questions import generate_questions
from app.services.extraction import extract_and_verify
from app.services.ingestion import ingest_transition, record_pipeline_stage

logger = logging.getLogger(__name__)


async def _record_failure(transition_id: UUID, actor_id: UUID, stage: str, error: Exception) -> None:
    async with SessionLocal() as db:
        transition = await db.get(Transition, transition_id)
        if not transition:
            return
        transition.status = "sources_ready" if stage in {"ingest", "extract"} else "awaiting_leaver_answers"
        await record_pipeline_stage(db, transition_id, stage, "failed", {"message": str(error)[:500]})
        await write_audit(
            db,
            action="automatic_pipeline_failed",
            entity_type="transition",
            actor_id=actor_id,
            entity_id=transition_id,
            transition_id=transition_id,
            detail={"stage": stage, "message": str(error)[:500]},
        )
        await db.commit()
    logger.exception("Automatic project pipeline failed at %s for transition %s", stage, transition_id)


async def process_approved_project(transition_id: UUID, actor_id: UUID) -> None:
    """Import sources, verify claims, and draft leaver questions after source submission."""
    active_stage = "ingest"
    try:
        async with SessionLocal() as db:
            transition = await db.get(Transition, transition_id)
            if not transition or transition.status != "ingesting":
                return
            await record_pipeline_stage(db, transition_id, "ingest", "running")
            await db.commit()

        async with SessionLocal() as db:
            result = await ingest_transition(db, transition_id)
            await record_pipeline_stage(db, transition_id, "ingest", "completed", result)
            await db.commit()

        active_stage = "extract"
        async with SessionLocal() as db:
            await record_pipeline_stage(db, transition_id, "extract", "running")
            await db.commit()
        async with SessionLocal() as db:
            extraction = await extract_and_verify(db, transition_id, replace_existing=True)
            await record_pipeline_stage(db, transition_id, "extract", "completed", extraction)
            await db.commit()

        active_stage = "questions"
        async with SessionLocal() as db:
            await record_pipeline_stage(db, transition_id, "exit_questions", "running")
            await db.commit()
        try:
            async with SessionLocal() as db:
                question_count = await generate_questions(db, transition_id)
                await record_pipeline_stage(db, transition_id, "exit_questions", "completed", {"questions": question_count})
                transition = await db.get(Transition, transition_id)
                if transition:
                    transition.status = "awaiting_leaver_answers" if question_count else "review" if transition.reviewer_id else "awaiting_reviewer_assignment"
                    await write_audit(
                        db,
                        action="automatic_pipeline_completed",
                        entity_type="transition",
                        actor_id=actor_id,
                        entity_id=transition_id,
                        transition_id=transition_id,
                        detail={"extraction": extraction, "questions": question_count},
                    )
                await db.commit()
        except Exception as exc:  # noqa: BLE001 - persist pipeline failure state for any processing error
            # Preserve imported sources and claims if free-tier quota blocks question drafting.
            await _record_failure(transition_id, actor_id, "questions", exc)
    except Exception as exc:  # noqa: BLE001 - persist pipeline failure state for any processing error
        await _record_failure(transition_id, actor_id, active_stage, exc)
