"""Initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "emails",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column("status", sa.Enum("verified", "invalid", "risky", "processing",
                                    "deliverable", "trusted", "probably_valid",
                                    "unconfirmed", "uncertain", "undeliverable",
                                    name="emailstatus"), nullable=False,
                  server_default="processing"),
        sa.Column("syntax_valid", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("domain_exists", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("mx_found", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("smtp_valid", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("disposable", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("role_based", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("catch_all", sa.Boolean(), nullable=True, server_default="0"),
        sa.Column("score", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("verified_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(),
                  onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_emails_domain", "emails", ["domain"])
    op.create_index("ix_emails_status", "emails", ["status"])

    op.create_table(
        "domains",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("mx_records", sa.JSON(), nullable=True),
        sa.Column("total_emails", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("verified_count", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("invalid_count", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("risky_count", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("bounce_rate", sa.Float(), nullable=True, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("domain"),
    )

    op.create_table(
        "jobs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("job_id", sa.String(100), nullable=False),
        sa.Column("file_name", sa.String(500), nullable=True),
        sa.Column("s3_key", sa.String(500), nullable=True),
        sa.Column("status", sa.Enum("pending", "processing", "completed", "failed",
                                    name="jobstatus"), nullable=False,
                  server_default="pending"),
        sa.Column("total", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("processed", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("verified", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("invalid", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("risky", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id"),
    )
    op.create_index("ix_jobs_job_id", "jobs", ["job_id"])


def downgrade():
    op.drop_table("jobs")
    op.drop_table("domains")
    op.drop_table("emails")