"""add smtp_outcome and smtp_response_code columns to emails table

Revision ID: add_smtp_outcome_columns
Revises: e7b2a4c9f1d3
Create Date: 2026-07-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a3f8c2e91b4d'
down_revision = 'e7b2a4c9f1d3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('emails', sa.Column('smtp_outcome', sa.String(30), nullable=True))
    op.add_column('emails', sa.Column('smtp_response_code', sa.Integer(), nullable=True))


def downgrade():
    op.drop_column('emails', 'smtp_response_code')
    op.drop_column('emails', 'smtp_outcome')
