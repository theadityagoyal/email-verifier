"""add missing indexes declared in models but never migrated

Revision ID: b7c3e91f4a2d
Revises: a1e5f9c3b7d2
Create Date: 2026-07-10 00:00:00.000000

These indexes are declared in models/models.py (__table_args__) but were
never actually created in the database:
  - ix_emails_status         (dropped in 755992d1fcc0, never recreated)
  - ix_emails_domain_status  (never created)
  - ix_emails_job_id_status  (never created)
  - ix_emails_verified_at    (never created)
  - ix_jobs_status           (never created)
  - ix_jobs_created_at       (never created)

Without these, status filters, domain+status filters, job+status filters,
verified_at range queries, and job status/created_at queries all fall back
to full table scans.
"""
from alembic import op
import sqlalchemy as sa


revision = 'b7c3e91f4a2d'
down_revision = 'a1e5f9c3b7d2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_emails_status', 'emails', ['status'], unique=False)
    op.create_index('ix_emails_domain_status', 'emails', ['domain', 'status'], unique=False)
    op.create_index('ix_emails_job_id_status', 'emails', ['job_id', 'status'], unique=False)
    op.create_index('ix_emails_verified_at', 'emails', ['verified_at'], unique=False)
    op.create_index('ix_jobs_status', 'jobs', ['status'], unique=False)
    op.create_index('ix_jobs_created_at', 'jobs', ['created_at'], unique=False)


def downgrade():
    op.drop_index('ix_jobs_created_at', table_name='jobs')
    op.drop_index('ix_jobs_status', table_name='jobs')
    op.drop_index('ix_emails_verified_at', table_name='emails')
    op.drop_index('ix_emails_job_id_status', table_name='emails')
    op.drop_index('ix_emails_domain_status', table_name='emails')
    op.drop_index('ix_emails_status', table_name='emails')
