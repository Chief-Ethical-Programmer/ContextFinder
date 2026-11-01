"""add claim evidence and conflict tables
Revision ID: 0003_claims
Revises: 0002_ingestion
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_claims"
down_revision = "0002_ingestion"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("claim_evidence", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("claim_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_claims.id", ondelete="CASCADE"), nullable=False), sa.Column("source_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_records.id", ondelete="CASCADE"), nullable=False), sa.Column("excerpt", sa.Text(), nullable=False), sa.Column("resolved", sa.Boolean(), nullable=False), sa.Column("note", sa.Text(), nullable=False))
    op.create_index("ix_claim_evidence_claim_id", "claim_evidence", ["claim_id"])
    op.create_index("ix_claim_evidence_source_record_id", "claim_evidence", ["source_record_id"])
    op.create_table("conflict_pairs", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("transition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transitions.id", ondelete="CASCADE"), nullable=False), sa.Column("claim_a_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_claims.id", ondelete="CASCADE"), nullable=False), sa.Column("claim_b_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_claims.id", ondelete="CASCADE"), nullable=False), sa.Column("reason", sa.Text(), nullable=False))
    op.create_table("dependencies", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("transition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transitions.id", ondelete="CASCADE"), nullable=False), sa.Column("from_entity", sa.String(200), nullable=False), sa.Column("to_entity", sa.String(200), nullable=False), sa.Column("claim_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("knowledge_claims.id", ondelete="SET NULL")))


def downgrade():
    op.drop_table("dependencies")
    op.drop_table("conflict_pairs")
    op.drop_index("ix_claim_evidence_source_record_id", table_name="claim_evidence")
    op.drop_index("ix_claim_evidence_claim_id", table_name="claim_evidence")
    op.drop_table("claim_evidence")
