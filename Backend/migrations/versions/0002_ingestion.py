"""add pipeline run tracking
Revision ID: 0002_ingestion
Revises: 0001_foundation
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_ingestion"
down_revision = "0001_foundation"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "pipeline_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("transition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("stage", sa.String(40), nullable=False),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("detail", postgresql.JSONB(), nullable=False),
    )
    op.create_index("ix_pipeline_runs_transition_id", "pipeline_runs", ["transition_id"])


def downgrade():
    op.drop_index("ix_pipeline_runs_transition_id", table_name="pipeline_runs")
    op.drop_table("pipeline_runs")
