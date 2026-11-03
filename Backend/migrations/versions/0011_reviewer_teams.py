"""store the registered team on user accounts

Revision ID: 0011_reviewer_teams
Revises: 0010_request_intake
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_reviewer_teams"
down_revision = "0010_request_intake"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("team", sa.String(length=120), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("users", "team")
