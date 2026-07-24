"""add smtp_retry_queue table for greylisting delayed retries

Revision ID: add_smtp_retry_queue
Revises: add_sub_status_columns
Create Date: 2026-07-24 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_smtp_retry_queue'
down_revision = 'add_sub_status_columns'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'smtp_retry_queue',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('domain', sa.String(255), nullable=False),
        sa.Column('mx_host', sa.String(255), nullable=False),
        sa.Column('mx_records', sa.JSON(), nullable=False),
        sa.Column('attempt', sa.Integer(), nullable=False, default=1),
        sa.Column('max_attempts', sa.Integer(), nullable=False, default=4),
        sa.Column('next_retry_at', sa.DateTime(), nullable=False, index=True),
        sa.Column('last_outcome', sa.String(30), nullable=False),
        sa.Column('last_smtp_code', sa.Integer(), nullable=True),
        sa.Column('last_response', sa.Text(), nullable=True),
        sa.Column('job_id', sa.String(100), nullable=True, index=True),
        sa.Column('status', sa.String(20), nullable=False, default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_retry_pending', 'smtp_retry_queue', ['status', 'next_retry_at'])
    op.create_index('idx_retry_email', 'smtp_retry_queue', ['email'])


def downgrade():
    op.drop_index('idx_retry_email', table_name='smtp_retry_queue')
    op.drop_index('idx_retry_pending', table_name='smtp_retry_queue')
    op.drop_table('smtp_retry_queue')