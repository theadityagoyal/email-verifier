"""add api_key_usage_logs table for admin usage tracking

Revision ID: c2f8a4d91e3b
Revises: b7c3e91f4a2d
Create Date: 2026-07-11 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'c2f8a4d91e3b'
down_revision = 'b7c3e91f4a2d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'api_key_usage_logs',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('api_key_id', sa.BigInteger(), nullable=False),
        sa.Column('endpoint', sa.String(length=20), nullable=False),
        sa.Column('status_code', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_api_key_usage_logs_api_key_id'), 'api_key_usage_logs', ['api_key_id'], unique=False)
    op.create_index(op.f('ix_api_key_usage_logs_created_at'), 'api_key_usage_logs', ['created_at'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_api_key_usage_logs_created_at'), table_name='api_key_usage_logs')
    op.drop_index(op.f('ix_api_key_usage_logs_api_key_id'), table_name='api_key_usage_logs')
    op.drop_table('api_key_usage_logs')
