"""add verification_error column to emails table

Revision ID: a9c4d7e2f5b1
Revises: fb0e8ed1bc40
Create Date: 2026-07-29 00:00:00.000000

CRITICAL FIX: services/domain_service.py's _EMAIL_ERROR_TERMINAL_SQL (raw SQL,
used whenever verify_email() throws mid-pipeline) has always referenced an
`emails.verification_error` column, and schemas.EmailVerifyResponse /
email_service.py have always read/written response.verification_error — but
no migration ever actually created this column, and it was never declared on
the Email ORM model either.

Effect: every time a verification errors out (status=EmailStatus.error), the
raw SQL INSERT ... ON DUPLICATE KEY UPDATE in async_upsert_email_error_terminal
fails with "Unknown column 'verification_error' in field list". That
exception is caught and swallowed by _persist_result()'s try/except (logged
as "verification_persist_failed"), so the row is NEVER actually updated to
status='error' — it stays stuck at whatever state it was in before (usually
'processing', since _mark_processing already ran). This silently reintroduces
the exact "stuck at Processing forever" bug that tests/test_error_handling.py
believes is fixed (that test mocks async_upsert_email_error_terminal directly,
so it never exercises the real SQL and never caught this).
"""
from alembic import op
import sqlalchemy as sa


revision = 'a9c4d7e2f5b1'
down_revision = 'fb0e8ed1bc40'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('emails', sa.Column('verification_error', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('emails', 'verification_error')
