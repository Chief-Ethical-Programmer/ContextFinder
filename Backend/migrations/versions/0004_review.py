"""add review and handover workflow tables
Revision ID: 0004_review
Revises: 0003_claims
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004_review"
down_revision = "0003_claims"
branch_labels = None
depends_on = None


def _uuid(name, fk=None, nullable=False):
    return sa.Column(name, postgresql.UUID(as_uuid=True), sa.ForeignKey(fk, ondelete="CASCADE") if fk else None, primary_key=fk is None, nullable=nullable)


def upgrade():
    op.create_table("claim_versions", _uuid("id"), _uuid("claim_id", "knowledge_claims.id", True), sa.Column("version", sa.Integer(), nullable=False), sa.Column("statement", sa.Text(), nullable=False), _uuid("changed_by", "users.id", True), sa.Column("change_kind", sa.String(30), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_claim_versions_claim_id", "claim_versions", ["claim_id"])
    op.create_index("ix_claim_versions_changed_by", "claim_versions", ["changed_by"])
    op.create_table("review_events", _uuid("id"), _uuid("claim_id", "knowledge_claims.id", True), _uuid("reviewer_id", "users.id", True), sa.Column("action", sa.String(30), nullable=False), sa.Column("note", sa.Text(), nullable=False), sa.Column("version", sa.Integer(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_review_events_claim_id", "review_events", ["claim_id"])
    op.create_index("ix_review_events_reviewer_id", "review_events", ["reviewer_id"])
    op.create_table("exit_questions", _uuid("id"), _uuid("transition_id", "transitions.id", True), _uuid("claim_id", "knowledge_claims.id", True), sa.Column("prompt", sa.Text(), nullable=False), sa.Column("system_finding", sa.Text(), nullable=False), sa.Column("trust_label", sa.String(30), nullable=False), sa.Column("status", sa.String(30), nullable=False))
    op.create_index("ix_exit_questions_transition_id", "exit_questions", ["transition_id"])
    op.create_index("ix_exit_questions_claim_id", "exit_questions", ["claim_id"])
    op.create_table("exit_answers", _uuid("id"), _uuid("question_id", "exit_questions.id", True), _uuid("answered_by", "users.id", True), sa.Column("body", sa.Text(), nullable=False), sa.Column("kind", sa.String(20), nullable=False), sa.Column("created_claim_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_claims.id", ondelete="SET NULL")), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_exit_answers_question_id", "exit_answers", ["question_id"])
    op.create_index("ix_exit_answers_answered_by", "exit_answers", ["answered_by"])
    op.create_table("handover_versions", _uuid("id"), _uuid("transition_id", "transitions.id", True), sa.Column("version", sa.Integer(), nullable=False), _uuid("published_by", "users.id", True), sa.Column("published_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.Column("remarks", sa.Text(), nullable=False), sa.Column("target_recipient_role", sa.String(30), nullable=False), sa.Column("snapshot", postgresql.JSONB(), nullable=False))
    op.create_index("ix_handover_versions_transition_id", "handover_versions", ["transition_id"])
    op.create_index("ix_handover_versions_published_by", "handover_versions", ["published_by"])


def downgrade():
    for table in ("handover_versions", "exit_answers", "exit_questions", "review_events", "claim_versions"):
        op.drop_table(table)
