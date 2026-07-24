"""add spf_valid and dmarc_valid columns to emails table

Revision ID: add_spf_dmarc_columns
Revises: add_smtp_retry_queue
Create Date: 2026-07-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_spf_dmarc_columns'
down_revision = 'add_smtp_retry_queue'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('emails', sa.Column('spf_valid', sa.Boolean(), nullable=True))
    op.add_column('emails', sa.Column('dmarc_valid', sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column('emails', 'dmarc_valid')
    op.drop_column('emails', 'spf_valid')