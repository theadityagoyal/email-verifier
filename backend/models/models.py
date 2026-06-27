from sqlalchemy import (
    Column, BigInteger, String, Boolean, Integer,
    DateTime, Float, Text, Enum as SAEnum, JSON
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
    verified_at = Column(DateTime, nullable=True)
    job_id = Column(String(100), nullable=True, index=True)
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
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
