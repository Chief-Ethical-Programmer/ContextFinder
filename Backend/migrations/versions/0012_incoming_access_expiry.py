"""expire incoming onboarding access after 30 days

Revision ID: 0012_incoming_access_expiry
Revises: 0011_reviewer_teams
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_incoming_access_expiry"
down_revision = "0011_reviewer_teams"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("transitions", sa.Column("incoming_access_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_transitions_incoming_access_expires_at", "transitions", ["incoming_access_expires_at"])
    # Give already-assigned onboarding members a fresh 30-day window after rollout.
    op.execute("UPDATE transitions SET incoming_access_expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days' WHERE incoming_user_id IS NOT NULL AND status IN ('published', 'acknowledged')")


def downgrade() -> None:
    op.drop_index("ix_transitions_incoming_access_expires_at", table_name="transitions")
    op.drop_column("transitions", "incoming_access_expires_at")
