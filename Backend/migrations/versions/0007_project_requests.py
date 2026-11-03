"""leaver project requests for admin approval
Revision ID: 0007_project_requests
Revises: 0006_merge_reviewer_into_admin
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0007_project_requests"
down_revision = "0006_merge_reviewer_into_admin"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("reviewer_note", sa.Text(), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_project_requests_requested_by", "project_requests", ["requested_by"])
    op.create_index("ix_project_requests_status", "project_requests", ["status"])
    op.create_index("ix_project_requests_reviewed_by", "project_requests", ["reviewed_by"])
    op.create_index("ix_project_requests_project_id", "project_requests", ["project_id"])


def downgrade():
    op.drop_table("project_requests")
