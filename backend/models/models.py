from sqlalchemy import (
    Column, BigInteger, String, Boolean, Integer,
    DateTime, Float, Text, Enum as SAEnum, JSON, CheckConstraint, Index
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func
import enum


class Base(DeclarativeBase):
    pass


class EmailStatus(str, enum.Enum):
    verified = "verified"
    invalid = "invalid"
    risky = "risky"
    processing = "processing"
    deliverable = "deliverable"
    trusted = "trusted"
    probably_valid = "probably_valid"
    unconfirmed = "unconfirmed"
    uncertain = "uncertain"
    undeliverable = "undeliverable"


class JobStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    # NEW: graceful cancellation support. A job moves here only after the
    # background worker actually observes Job.cancel_requested and stops
    # submitting further work — never set directly by the cancel request
    # itself (see api/v1/endpoints/bulk.py + tasks/bulk_processor.py).
    cancelled = "cancelled"


# ── Notifications ─────────────────────────────────────────────────────────

class NotificationType(str, enum.Enum):
    success = "success"
    error = "error"
    warning = "warning"
    info = "info"


class NotificationPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Email(Base):
    __tablename__ = "emails"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    domain = Column(String(255), nullable=True, index=True)
    status = Column(
        SAEnum(EmailStatus),
        nullable=False,
        default=EmailStatus.processing,
    )
    syntax_valid = Column(Boolean, default=False)
    domain_exists = Column(Boolean, default=False)
    mx_found = Column(Boolean, default=False)
    smtp_valid = Column(Boolean, default=False)
    disposable = Column(Boolean, default=False)
    role_based = Column(Boolean, default=False)
    catch_all = Column(Boolean, default=False)
    score = Column(Integer, default=0)
    verified_at = Column(DateTime, nullable=True, index=True)
    job_id = Column(String(100), nullable=True, index=True)
    __table_args__ = (
        CheckConstraint('score >= 0 AND score <= 100', name='check_score_range'),
        Index('ix_emails_domain_status', 'domain', 'status'),
        Index('ix_emails_status', 'status'),
        Index('ix_emails_job_id_status', 'job_id', 'status'),
        Index('ix_emails_verified_at', 'verified_at'),
    )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class Domain(Base):
    __tablename__ = "domains"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    domain = Column(String(255), unique=True, nullable=False, index=True)
    mx_records = Column(JSON, nullable=True)
    total_emails = Column(Integer, default=0)
    verified_count = Column(Integer, default=0)
    invalid_count = Column(Integer, default=0)
    risky_count = Column(Integer, default=0)
    bounce_rate = Column(Float, default=0.0)
    __table_args__ = (
        CheckConstraint('bounce_rate >= 0.0 AND bounce_rate <= 100.0', name='check_bounce_rate_range'),
    )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now())


class Job(Base):
    __tablename__ = "jobs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(String(100), unique=True, nullable=False, index=True)
    file_name = Column(String(500), nullable=True)
    s3_key = Column(String(500), nullable=True)
    status = Column(
        SAEnum(JobStatus),
        nullable=False,
        default=JobStatus.pending,
    )
    current_stage = Column(String(20), nullable=False, default='uploading')
    progress_percent = Column(Integer, nullable=False, default=0)
    estimated_time_remaining = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error_details = Column(JSON, nullable=True)
    total = Column(Integer, default=0)
    processed = Column(Integer, default=0)
    verified = Column(Integer, default=0)
    invalid = Column(Integer, default=0)
    risky = Column(Integer, default=0)
    error_message = Column(Text, nullable=True)
    # NEW: cooperative cancellation flag. Set to True by
    # POST /api/v1/jobs/{job_id}/cancel; the background worker
    # (tasks/bulk_processor.py) polls this periodically and stops
    # submitting new work once it sees it, then flips `status` to
    # JobStatus.cancelled itself. Already-processed emails are never
    # touched — each one commits independently as it completes.
    cancel_requested = Column(Boolean, nullable=False, default=False)
    __table_args__ = (
        CheckConstraint('progress_percent >= 0 AND progress_percent <= 100', name='check_progress_range'),
        CheckConstraint('total >= 0', name='check_total_nonnegative'),
        CheckConstraint('processed >= 0', name='check_processed_nonnegative'),
        CheckConstraint('verified >= 0', name='check_verified_nonnegative'),
        CheckConstraint('invalid >= 0', name='check_invalid_nonnegative'),
        CheckConstraint('risky >= 0', name='check_risky_nonnegative'),
        Index('ix_jobs_status', 'status'),
        Index('ix_jobs_created_at', 'created_at'),
    )
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ApiKey(Base):
    """
    API keys for the external developer platform (/api/external/v1/*).
    We store only the SHA-256 hash of the key — never the plaintext.
    Keys are created/managed via scripts/manage_api_keys.py or the admin
    dashboard (/api/v1/admin/api-keys).
    """
    __tablename__ = "api_keys"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    key_hash = Column(String(64), unique=True, nullable=False, index=True)
    key_prefix = Column(String(20), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    rate_limit_per_min = Column(Integer, default=60, nullable=False)
    bulk_limit_per_hour = Column(Integer, default=5, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class ApiKeyUsageLog(Base):
    """
    Lightweight per-request usage log for external API keys. Powers the
    admin dashboard's usage chart (verify vs bulk calls per day) and the
    total-calls / last-used columns on the API Keys table.

    Kept intentionally minimal — no FK constraint (consistent with this
    project's existing pattern of not enforcing hard FKs, e.g. Email.job_id),
    just an indexed api_key_id column.
    """
    __tablename__ = "api_key_usage_logs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    api_key_id = Column(BigInteger, nullable=False, index=True)
    endpoint = Column(String(20), nullable=False)  # "verify" | "bulk"
    status_code = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)


class Notification(Base):
    """
    Global, in-app notifications surfaced via the header notification bell.
    Single-tenant for now (no user/tenant scoping column) — every row is
    visible to every viewer of the dashboard. Kept deliberately generic
    (title/message/type/priority/metadata) so a `user_id` column can be
    added later without changing the shape of existing rows or the API
    contract; every write path goes through services/notification_service.py
    so that's the only place such a change would need to happen.
    """
    __tablename__ = "notifications"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(SAEnum(NotificationType), nullable=False, default=NotificationType.info)
    priority = Column(SAEnum(NotificationPriority), nullable=False, default=NotificationPriority.medium)
    is_read = Column(Boolean, nullable=False, default=False)
    # Mapped to a DB column literally named "metadata" (matches the
    # requested schema), but exposed under a different Python attribute
    # name because `metadata` is reserved on every SQLAlchemy Declarative
    # model (Base.metadata is the schema/table registry) and would collide.
    extra_data = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('ix_notifications_created_at', 'created_at'),
        Index('ix_notifications_is_read', 'is_read'),
    )
