"""allow leavers to attach source intake before project approval
Revision ID: 0010_request_intake
Revises: 0009_project_teams_incoming
"""
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010_request_intake"
down_revision = "0009_project_teams_incoming"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("project_requests", sa.Column("transition_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_project_requests_transition_id", "project_requests", "transitions", ["transition_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_project_requests_transition_id", "project_requests", ["transition_id"])

    bind = op.get_bind()
    admin_id = bind.execute(sa.text("SELECT id FROM users WHERE role = 'admin' ORDER BY email LIMIT 1")).scalar()
    if not admin_id:
        return
    requests = bind.execute(sa.text("SELECT id, name, team, description, requested_by, project_id FROM project_requests WHERE status = 'pending' AND project_id IS NULL ORDER BY created_at")).mappings().all()
    for request in requests:
        project_id = bind.execute(sa.text("SELECT id FROM projects WHERE lower(name) = lower(:name) LIMIT 1"), {"name": request["name"]}).scalar()
        if not project_id:
            project_id = uuid4()
            bind.execute(sa.text("INSERT INTO projects (id, name, team, description, synthetic) VALUES (:id, :name, :team, :description, false)"), {"id": project_id, "name": request["name"], "team": request["team"], "description": request["description"]})
        for member_id, role in ((admin_id, "admin"), (request["requested_by"], "departing")):
            membership = bind.execute(sa.text("SELECT id FROM project_roles WHERE project_id = :project_id AND user_id = :user_id AND project_role = :role LIMIT 1"), {"project_id": project_id, "user_id": member_id, "role": role}).scalar()
            if not membership:
                bind.execute(sa.text("INSERT INTO project_roles (id, project_id, user_id, project_role) VALUES (:id, :project_id, :user_id, :role)"), {"id": uuid4(), "project_id": project_id, "user_id": member_id, "role": role})
        transition_id = uuid4()
        bind.execute(sa.text("INSERT INTO transitions (id, project_id, departing_user_id, incoming_user_id, target_recipient_role, status, created_by) VALUES (:id, :project_id, :departing, NULL, 'technical_successor', 'awaiting_project_approval', :admin)"), {"id": transition_id, "project_id": project_id, "departing": request["requested_by"], "admin": admin_id})
        bind.execute(sa.text("UPDATE project_requests SET project_id = :project_id, transition_id = :transition_id WHERE id = :request_id"), {"project_id": project_id, "transition_id": transition_id, "request_id": request["id"]})


def downgrade():
    op.drop_index("ix_project_requests_transition_id", table_name="project_requests")
    op.drop_constraint("fk_project_requests_transition_id", "project_requests", type_="foreignkey")
    op.drop_column("project_requests", "transition_id")
