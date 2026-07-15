"""add notifications table and job cancellation support

Revision ID: f3a9c1d7e5b2
Revises: c2f8a4d91e3b
Create Date: 2026-07-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f3a9c1d7e5b2'
down_revision = 'c2f8a4d91e3b'
branch_labels = None
depends_on = None


def upgrade():
    # ── Job cancellation support ────────────────────────────────────────
    op.add_column(
        'jobs',
        sa.Column('cancel_requested', sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # MySQL ENUM columns are fixed at the DB level — adding a new allowed
    # value ('cancelled') requires an explicit MODIFY COLUMN, not just a
    # Python-side enum change in models.py.
    op.execute(
        "ALTER TABLE jobs MODIFY COLUMN status "
        "ENUM('pending','processing','completed','failed','cancelled') "
        "NOT NULL DEFAULT 'pending'"
    )

    # ── Notifications table ──────────────────────────────────────────────
    op.create_table(
        'notifications',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column(
            'type',
            sa.Enum('success', 'error', 'warning', 'info', name='notificationtype'),
            nullable=False,
            server_default='info',
        ),
        sa.Column(
            'priority',
            sa.Enum('low', 'medium', 'high', name='notificationpriority'),
            nullable=False,
            server_default='medium',
        ),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_notifications_created_at'), 'notifications', ['created_at'], unique=False)
    op.create_index(op.f('ix_notifications_is_read'), 'notifications', ['is_read'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_notifications_is_read'), table_name='notifications')
    op.drop_index(op.f('ix_notifications_created_at'), table_name='notifications')
    op.drop_table('notifications')

    op.execute(
        "ALTER TABLE jobs MODIFY COLUMN status "
        "ENUM('pending','processing','completed','failed') "
        "NOT NULL DEFAULT 'pending'"
    )
    op.drop_column('jobs', 'cancel_requested')
