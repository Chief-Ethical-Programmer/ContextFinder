"""merge reviewer role into admin
Revision ID: 0006_merge_reviewer_into_admin
Revises: 0005_handover
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_merge_reviewer_into_admin"
down_revision = "0005_handover"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text("UPDATE users SET role = 'admin' WHERE role = 'reviewer'"))
    op.execute(sa.text("UPDATE project_roles SET project_role = 'admin' WHERE project_role = 'reviewer'"))


def downgrade():
    # The role merge is intentionally not reversible for existing accounts.
    pass
