"""add project teams and allow unassigned incoming members
Revision ID: 0009_project_teams_incoming
Revises: 0008_transition_reviewer
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_project_teams_incoming"
down_revision = "0008_transition_reviewer"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("projects", sa.Column("team", sa.String(120), nullable=False, server_default=""))
    op.add_column("project_requests", sa.Column("team", sa.String(120), nullable=False, server_default=""))
    op.alter_column("transitions", "incoming_user_id", existing_type=sa.UUID(), nullable=True)
    op.drop_constraint("transitions_incoming_user_id_fkey", "transitions", type_="foreignkey")
    op.create_foreign_key("fk_transitions_incoming_user_id_users", "transitions", "users", ["incoming_user_id"], ["id"], ondelete="SET NULL")


def downgrade():
    op.drop_constraint("fk_transitions_incoming_user_id_users", "transitions", type_="foreignkey")
    op.alter_column("transitions", "incoming_user_id", existing_type=sa.UUID(), nullable=False)
    op.create_foreign_key("transitions_incoming_user_id_fkey", "transitions", "users", ["incoming_user_id"], ["id"])
    op.drop_column("project_requests", "team")
    op.drop_column("projects", "team")
