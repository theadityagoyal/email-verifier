from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
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
    verified: int
    invalid: int
    risky: int
    processing: int
    queue_size: int
    success_rate: float


class VerificationTrend(BaseModel):
    date: str
    verified: int
    invalid: int
    risky: int
