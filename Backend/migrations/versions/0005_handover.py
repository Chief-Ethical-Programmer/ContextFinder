"""add role views, access requests and acknowledgements
Revision ID: 0005_handover
Revises: 0004_review
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_handover"
down_revision = "0004_review"
branch_labels = None
depends_on = None


def uuid_column(name, foreign_key, nullable=False):
    return sa.Column(name, postgresql.UUID(as_uuid=True), sa.ForeignKey(foreign_key, ondelete="CASCADE"), nullable=nullable)


def upgrade():
    op.create_table("role_views", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), uuid_column("handover_version_id", "handover_versions.id"), sa.Column("recipient_role", sa.String(30), nullable=False), sa.Column("summary", sa.Text(), nullable=False), sa.Column("plan_30_60_90", postgresql.JSONB(), nullable=False), sa.Column("generation_mode", sa.String(20), nullable=False), sa.Column("claim_ids", postgresql.JSONB(), nullable=False))
    op.create_index("ix_role_views_handover_version_id", "role_views", ["handover_version_id"])
    op.create_table("recipient_access", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), uuid_column("handover_version_id", "handover_versions.id"), uuid_column("user_id", "users.id"), sa.Column("recipient_role", sa.String(30), nullable=False))
    op.create_index("ix_recipient_access_handover_version_id", "recipient_access", ["handover_version_id"])
    op.create_index("ix_recipient_access_user_id", "recipient_access", ["user_id"])
    op.create_table("access_requests", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), uuid_column("handover_version_id", "handover_versions.id"), uuid_column("user_id", "users.id"), sa.Column("note", sa.Text(), nullable=False), sa.Column("status", sa.String(20), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_access_requests_handover_version_id", "access_requests", ["handover_version_id"])
    op.create_index("ix_access_requests_user_id", "access_requests", ["user_id"])
    op.create_table("acknowledgements", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), uuid_column("handover_version_id", "handover_versions.id"), uuid_column("user_id", "users.id"), sa.Column("acknowledged_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False), sa.UniqueConstraint("handover_version_id", "user_id", name="ix_acknowledgements_version_user"))
    op.create_index("ix_acknowledgements_handover_version_id", "acknowledgements", ["handover_version_id"])
    op.create_index("ix_acknowledgements_user_id", "acknowledgements", ["user_id"])


def downgrade():
    for table in ("acknowledgements", "access_requests", "recipient_access", "role_views"):
        op.drop_table(table)
