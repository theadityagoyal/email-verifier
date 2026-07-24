"""add sub_status, confidence, reason_code columns to emails table

Revision ID: add_sub_status_columns
Revises: a3f8c2e91b4d
Create Date: 2026-07-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_sub_status_columns'
down_revision = 'a3f8c2e91b4d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('emails', sa.Column('sub_status', sa.String(50), nullable=True))
    op.add_column('emails', sa.Column('confidence', sa.String(10), nullable=True))
    op.add_column('emails', sa.Column('reason_code', sa.String(50), nullable=True))


def downgrade():
    op.drop_column('emails', 'reason_code')
    op.drop_column('emails', 'confidence')
    op.drop_column('emails', 'sub_status')