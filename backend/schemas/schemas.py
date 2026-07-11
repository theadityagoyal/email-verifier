from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, Dict, List
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
    # New, optional (backward compatible — defaults to None for any caller
    # not yet aware of it). Populated by the verification pipeline with the
    # real DNS-resolved MX hostnames so the caller can persist them onto
    # Domain.mx_records. Left as None when the DNS lookup was skipped
    # entirely (trusted-domain fast path), so we never overwrite a
    # previously known-good value with a placeholder.
    mx_records: Optional[List[str]] = None

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

    @field_validator('total', 'processed', 'verified', 'invalid', 'risky')
    @classmethod
    def count_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


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
    total_emails: int = 0
    safe_count: int = 0
    risky_count: int = 0
    unsafe_count: int = 0
    processing_count: int = 0
    risk_percent: float = 0.0
    trust_score: int = 0
    verdict: str = "Low Sample"
    disposable_count: int = 0
    role_based_count: int = 0
    catch_all_count: int = 0

    mx_records: Optional[List[str]] = None
    mx_status: str = "Unknown"

    first_seen: Optional[datetime] = None

    trend: str = "stable"
    trend_delta_pct: Optional[float] = None

    is_new: bool = False
    low_sample: bool = False

    model_config = {"from_attributes": True}

    @field_validator('trust_score')
    @classmethod
    def trust_score_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Trust score must be between 0 and 100')
        return v

    @field_validator('risk_percent')
    @classmethod
    def risk_percent_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Risk percent must be between 0 and 100')
        return v


class DailyVolumeStats(BaseModel):
    date: str
    safe: int = 0
    risky: int = 0
    unsafe: int = 0
    processing: int = 0

    model_config = {"from_attributes": True}

    @field_validator('safe', 'risky', 'unsafe', 'processing')
    @classmethod
    def validate_counts_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


class TopDomainItem(BaseModel):
    domain: str
    safe: int = 0
    risky: int = 0
    unsafe: int = 0
    processing: int = 0
    total: int = 0
    risk_pct: float = 0.0

    model_config = {"from_attributes": True}

    @field_validator('safe', 'risky', 'unsafe', 'processing', 'total')
    @classmethod
    def count_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v

    @field_validator('risk_pct')
    @classmethod
    def risk_pct_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Risk percent must be between 0 and 100')
        return v


class PaginatedDomainsResponse(BaseModel):
    items: list[DomainStats]
    total: int
    page: int
    size: int
    pages: int

    # ── NEW: echoes back the sort actually applied (post-validation/fallback)
    # so the frontend can sync its column-header UI + URL query params to
    # what the server really did, instead of assuming the request params
    # were honored verbatim (e.g. an invalid sort_by silently falls back to
    # the default on the backend — the frontend needs to know that happened).
    sort_by: str = "first_seen"
    sort_order: str = "desc"

    model_config = {"from_attributes": True}


class ActiveJob(BaseModel):
    job_id: str
    file_name: Optional[str] = None
    progress_percent: int
    processed: int
    total: int

    model_config = {"from_attributes": True}

    @field_validator('progress_percent')
    @classmethod
    def validate_progress_percent(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Progress percent must be between 0 and 100')
        return v

    @field_validator('processed', 'total')
    @classmethod
    def validate_counts_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v

    @field_validator('progress_percent')
    @classmethod
    def progress_percent_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Progress percent must be between 0 and 100')
        return v

    @field_validator('processed', 'total')
    @classmethod
    def count_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


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

    @field_validator('average_risk_percent', 'average_trust_score')
    @classmethod
    def percentage_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Percentage must be between 0 and 100')
        return v

    @field_validator('total_domains', 'total_emails', 'safe', 'risky', 'unsafe', 'processing',
                     'flagged_domains', 'disposable_domains', 'catch_all_domains', 'no_mx_domains',
                     'new_domains_count')
    @classmethod
    def count_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


# ── New: powers the "Flagged Emails" card's Overview row on the dashboard ────

class FlaggedOverview(BaseModel):
    total_flagged: int
    total_flagged_trend_pct: float
    high_priority: int
    high_priority_trend_pct: float
    flag_rate: float
    flag_rate_trend_pct: float
    last_7_days: int
    last_7_days_trend_pct: float

    model_config = {"from_attributes": True}

    @field_validator('total_flagged', 'high_priority', 'last_7_days')
    @classmethod
    def count_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


# ── New: powers the "Worst Domains" card's Summary row on the dashboard ─────

class DomainSummary(BaseModel):
    avg_reputation: int
    avg_reputation_trend_pct: float
    high_risk_count: int
    high_risk_trend_pct: float
    total_domains: int
    total_domains_trend_pct: float
    improving_count: int
    improving_trend_pct: float

    model_config = {"from_attributes": True}

    @field_validator('avg_reputation')
    @classmethod
    def reputation_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Reputation must be between 0 and 100')
        return v

    @field_validator('total_domains', 'high_risk_count', 'improving_count')
    @classmethod
    def count_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v


class DashboardStats(BaseModel):
    total_emails: int
    per_status_counts: Dict[str, int]  # verified, deliverable, trusted, probably_valid, risky, unconfirmed, uncertain, invalid, undeliverable, processing
    bucket_counts: Dict[str, int]      # safe, risky, unsafe, processing
    trust_score: int                   # 0-100
    flagged_counts: Dict[str, int]     # disposable, role_based, catch_all
    top_domains: List[TopDomainItem]  # each: {domain, safe, risky, unsafe, processing, total, risk_pct}
    daily_volume: List[DailyVolumeStats] # each: {date, safe, risky, unsafe, processing}
    active_job: Optional[ActiveJob] = None

    # ── Powers the enhanced Status Breakdown card ────────────────────────────
    per_status_trend: Dict[str, int] = {}      # raw count delta per status vs previous 24h
    bucket_trend_pct: Dict[str, float] = {}    # % change per bucket vs previous 24h
    total_emails_trend_pct: float = 0.0        # % change in total email count vs previous 24h
                                                # (powers the "Total Emails" stat card trend arrow)
    verification_speed: float = 0.0            # emails/sec, live (last 5 min window)
    avg_processing_time_ms: Optional[float] = None  # avg time from created_at -> verified_at, last 24h

    # ── Powers the Flagged Emails card + Worst Domains card (Overview/Summary rows) ─
    flagged_overview: FlaggedOverview
    domain_summary: DomainSummary

    generated_at: datetime                     # server timestamp this response was built at;
                                                # frontend derives "2 min ago" / "Just now" from this

    model_config = {"from_attributes": True}

    @field_validator('trust_score')
    @classmethod
    def trust_score_must_be_valid(cls, v):
        if not 0 <= v <= 100:
            raise ValueError('Trust score must be between 0 and 100')
        return v


class VerificationTrend(BaseModel):
    date: str
    verified: int = 0
    deliverable: int = 0
    trusted: int = 0
    probably_valid: int = 0
    risky: int = 0
    unconfirmed: int = 0
    uncertain: int = 0
    invalid: int = 0
    undeliverable: int = 0
    processing: int = 0

    model_config = {"from_attributes": True}

    @field_validator('verified', 'deliverable', 'trusted', 'probably_valid', 'risky', 'unconfirmed', 'uncertain', 'invalid', 'undeliverable', 'processing')
    @classmethod
    def validate_counts_non_negative(cls, v):
        if v < 0:
            raise ValueError('Count must be non-negative')
        return v
