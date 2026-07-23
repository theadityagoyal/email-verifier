"""add TTL tracking columns for smart verification result reuse

Revision ID: e7b2a4c9f1d3
Revises: f3a9c1d7e5b2
Create Date: 2026-07-22 00:00:00.000000

Adds:
  - emails.dns_checked_at   -- last time domain_exists/mx_found were actually
                               checked via real DNS I/O (NULL = never checked
                               via the new reuse-aware pipeline, e.g. old rows,
                               or trusted-domain fast path which never queries DNS)
  - emails.smtp_checked_at  -- last time smtp_valid/catch_all were actually
                               checked via a real SMTP probe (NULL = never
                               checked / was skipped due to disposable/no-MX/trusted)
  - jobs.duplicate_emails_removed / reused_results / newly_verified /
    dns_checks_saved / smtp_checks_saved -- bulk-job reuse metrics
"""
from alembic import op
import sqlalchemy as sa


revision = 'e7b2a4c9f1d3'
down_revision = 'f3a9c1d7e5b2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('emails', sa.Column('dns_checked_at', sa.DateTime(), nullable=True))
    op.add_column('emails', sa.Column('smtp_checked_at', sa.DateTime(), nullable=True))
    op.create_index(op.f('ix_emails_dns_checked_at'), 'emails', ['dns_checked_at'], unique=False)
    op.create_index(op.f('ix_emails_smtp_checked_at'), 'emails', ['smtp_checked_at'], unique=False)

    op.add_column('jobs', sa.Column('duplicate_emails_removed', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('jobs', sa.Column('reused_results', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('jobs', sa.Column('newly_verified', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('jobs', sa.Column('dns_checks_saved', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('jobs', sa.Column('smtp_checks_saved', sa.Integer(), nullable=False, server_default='0'))


def downgrade():
    op.drop_column('jobs', 'smtp_checks_saved')
    op.drop_column('jobs', 'dns_checks_saved')
    op.drop_column('jobs', 'newly_verified')
    op.drop_column('jobs', 'reused_results')
    op.drop_column('jobs', 'duplicate_emails_removed')

    op.drop_index(op.f('ix_emails_smtp_checked_at'), table_name='emails')
    op.drop_index(op.f('ix_emails_dns_checked_at'), table_name='emails')
    op.drop_column('emails', 'smtp_checked_at')
    op.drop_column('emails', 'dns_checked_at')
