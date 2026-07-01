from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Dict, List, Any
from datetime import datetime, date
from models.models import EmailStatus, JobStatus


# ── Request schemas ──────────────────────────────────────────────────────────

class EmailVerifyRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def strip_email(cls, v: str) -> str:
        return v.strip().lower()


# ── Response schemas ─────────────────────────────────────────────────────────

class EmailVerifyResponse(BaseModel):
    email: str
    domain: Optional[str]
    status: EmailStatus
    syntax_valid: bool
    domain_exists: bool
    mx_found: bool
    smtp_valid: bool
    disposable: bool
    role_based: bool
    catch_all: bool
    score: int
    username_quality: Optional[str] = None
    username_flags: Optional[list[str]] = None
    verified_at: Optional[datetime]

    model_config = {"from_attributes": True}


class JobStatusResponse(BaseModel):
    job_id: str
    file_name: Optional[str]
    status: JobStatus
    total: int
    processed: int
    verified: int
    invalid: int
    risky: int

    model_config = {"from_attributes": True}


class BulkUploadResponse(BaseModel):
    job_id: str
    message: str
    total_emails: int


# ── List/pagination schemas ───────────────────────────────────────────────────

class PaginatedEmailsResponse(BaseModel):
    items: list[EmailVerifyResponse]
    total: int
    page: int
    size: int
    pages: int


class DomainStats(BaseModel):
    domain: str
    total_emails: int
    verified_count: int
    invalid_count: int
    risky_count: int
    bounce_rate: float
    mx_records: Optional[list]

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    total_emails: int
    per_status_counts: Dict[str, int]  # keys: verified, deliverable, trusted, probably_valid, risky, unconfirmed, uncertain, invalid, undeliverable, processing
    bucket_counts: Dict[str, int]      # keys: safe, risky, unsafe, processing
    trust_score: int                   # 0-100
    flagged_counts: Dict[str, int]     # keys: disposable, role_based, catch_all
    top_domains: List[Dict[str, Any]]  # each: {domain: str, bucket_counts: Dict[str, int]}
    daily_volume: List[Dict[str, Any]] # each: {date: str, bucket_counts: Dict[str, int]}
    active_job: Optional[Dict[str, Any]] # {job_id: str, file_name: str, progress_percent: int, processed: int, total: int} or None

    model_config = {"from_attributes": True}


class VerificationTrend(BaseModel):
    date: str
    verified: int
    invalid: int
    risky: int
