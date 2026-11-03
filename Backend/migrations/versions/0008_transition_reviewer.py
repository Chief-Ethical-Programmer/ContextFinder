"""assign reviewers to individual transitions
Revision ID: 0008_transition_reviewer
Revises: 0007_project_requests
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_transition_reviewer"
down_revision = "0007_project_requests"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("transitions", sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_transitions_reviewer_id_users", "transitions", "users", ["reviewer_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_transitions_reviewer_id", "transitions", ["reviewer_id"])


def downgrade():
    op.drop_index("ix_transitions_reviewer_id", table_name="transitions")
    op.drop_constraint("fk_transitions_reviewer_id_users", "transitions", type_="foreignkey")
    op.drop_column("transitions", "reviewer_id")
