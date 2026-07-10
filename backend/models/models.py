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
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


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
    Keys are created/managed via scripts/manage_api_keys.py (no admin UI yet).
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