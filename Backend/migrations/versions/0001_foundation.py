"""foundation core tables
Revision ID: 0001_foundation
Revises:
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_foundation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("users", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("email", sa.String(320), nullable=False, unique=True), sa.Column("name", sa.String(200), nullable=False), sa.Column("password_hash", sa.String(500), nullable=False), sa.Column("role", sa.String(30), nullable=False))
    op.create_table("projects", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("name", sa.String(200), nullable=False, unique=True), sa.Column("description", sa.Text(), nullable=False), sa.Column("synthetic", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("project_roles", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("project_role", sa.String(40), nullable=False))
    op.create_table("transitions", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=False), sa.Column("departing_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False), sa.Column("incoming_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False), sa.Column("target_recipient_role", sa.String(30), nullable=False), sa.Column("status", sa.String(30), nullable=False), sa.Column("due_at", sa.DateTime(timezone=True)), sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_table("source_connections", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("transition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transitions.id", ondelete="CASCADE"), nullable=False), sa.Column("kind", sa.String(30), nullable=False), sa.Column("config", postgresql.JSONB(), nullable=False), sa.Column("access_level", sa.String(30), nullable=False), sa.Column("status", sa.String(30), nullable=False))
    op.create_table("source_records", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("source_connections.id", ondelete="CASCADE"), nullable=False), sa.Column("external_id", sa.String(500), nullable=False), sa.Column("kind", sa.String(30), nullable=False), sa.Column("author", sa.String(200), nullable=False), sa.Column("occurred_at", sa.DateTime(timezone=True)), sa.Column("url", sa.String(1000)), sa.Column("text", sa.Text(), nullable=False), sa.Column("metadata", postgresql.JSONB(), nullable=False), sa.Column("access_level", sa.String(30), nullable=False), sa.Column("content_hash", sa.String(64), nullable=False), sa.Column("redacted", sa.Boolean(), nullable=False), sa.UniqueConstraint("connection_id", "external_id", name="uq_source_records_connection_external"))
    op.create_table("knowledge_claims", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("transition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transitions.id", ondelete="CASCADE"), nullable=False), sa.Column("type", sa.String(30), nullable=False), sa.Column("statement", sa.Text(), nullable=False), sa.Column("subject_key", sa.String(200), nullable=False), sa.Column("status_value", sa.String(300)), sa.Column("trust_label", sa.String(30), nullable=False), sa.Column("trust_reason", sa.Text(), nullable=False), sa.Column("access_level", sa.String(30), nullable=False), sa.Column("origin", sa.String(30), nullable=False), sa.Column("review_state", sa.String(30), nullable=False), sa.Column("current_version", sa.Integer(), nullable=False), sa.Column("occurred_at", sa.DateTime(timezone=True)), sa.Column("flags", postgresql.JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_claims_transition_trust", "knowledge_claims", ["transition_id", "trust_label"])
    op.create_table("audit_events", sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True), sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")), sa.Column("action", sa.String(60), nullable=False), sa.Column("entity_type", sa.String(60), nullable=False), sa.Column("entity_id", postgresql.UUID(as_uuid=True)), sa.Column("transition_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("transitions.id")), sa.Column("detail", postgresql.JSONB(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False))


def downgrade():
    for table in ("audit_events", "knowledge_claims", "source_records", "source_connections", "transitions", "project_roles", "projects", "users"):
        op.drop_table(table)
