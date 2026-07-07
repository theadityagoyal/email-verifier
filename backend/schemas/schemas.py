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

    model_config = {"from_attributes": True}


# ── List/pagination schemas ───────────────────────────────────────────────────

class PaginatedEmailsResponse(BaseModel):
    items: list[EmailVerifyResponse]
    total: int
    page: int
    size: int
    pages: int

    model_config = {"from_attributes": True}


class DomainStats(BaseModel):
    domain: str

    total_emails: int

    safe_count: int
    risky_count: int
    unsafe_count: int
    processing_count: int

    risk_percent: float
    trust_score: int

    verdict: str

    disposable_count: int
    role_based_count: int
    catch_all_count: int

    mx_records: Optional[list] = None
    mx_status: str

    first_seen: Optional[datetime] = None

    trend: str = "stable"
    trend_delta_pct: Optional[float] = None

    is_new: bool = False
    low_sample: bool = False

    model_config = {"from_attributes": True}


class PaginatedDomainsResponse(BaseModel):
    items: list[DomainStats]
    total: int
    page: int
    size: int
    pages: int

    model_config = {"from_attributes": True}


class ActiveJob(BaseModel):
    job_id: str
    file_name: Optional[str] = None
    progress_percent: int
    processed: int
    total: int

    model_config = {"from_attributes": True}

class DomainOverview(BaseModel):
    total_domains: int

    total_emails: int

    safe: int
    risky: int
    unsafe: int
    processing: int

    flagged_domains: int
    disposable_domains: int
    catch_all_domains: int
    no_mx_domains: int
    new_domains_count: int

    average_risk_percent: float
    average_trust_score: int

    model_config = {"from_attributes": True}


class DashboardStats(BaseModel):
    total_emails: int
    per_status_counts: Dict[str, int]  # verified, deliverable, trusted, probably_valid, risky, unconfirmed, uncertain, invalid, undeliverable, processing
    bucket_counts: Dict[str, int]      # safe, risky, unsafe, processing
    trust_score: int                   # 0-100
    flagged_counts: Dict[str, int]     # disposable, role_based, catch_all
    top_domains: List[Dict[str, Any]]  # each: {domain, safe, risky, unsafe, processing, total, risk_pct}
    daily_volume: List[Dict[str, Any]] # each: {date, safe, risky, unsafe, processing}
    active_job: Optional[ActiveJob] = None

    # ── New: powers the enhanced Status Breakdown card ──────────────────────
    per_status_trend: Dict[str, int] = {}      # raw count delta per status vs previous 24h
    bucket_trend_pct: Dict[str, float] = {}    # % change per bucket vs previous 24h
    verification_speed: float = 0.0            # emails/sec, live (last 5 min window)
    avg_processing_time_ms: Optional[float] = None  # avg time from created_at -> verified_at, last 24h
    generated_at: datetime                     # server timestamp this response was built at;
                                                # frontend derives "2 min ago" / "Just now" from this

    model_config = {"from_attributes": True}


class VerificationTrend(BaseModel):
    date: str
    verified: int
    invalid: int
    risky: int

    model_config = {"from_attributes": True}