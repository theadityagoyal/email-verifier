"""
Centralized, atomic persistence for Email and Domain rows.

Why this exists:
  Previously there were three separate, subtly-inconsistent implementations
  of "save a verification result" spread across api/v1/endpoints/verify.py,
  tasks/bulk_processor.py, and api/external/v1/endpoints/verify.py — each
  doing its own check-then-insert-or-update dance (a race condition under
  concurrent requests for the same email) and each updating Domain's
  verified_count/invalid_count/risky_count/bounce_rate columns, which are
  never actually read anywhere (the dashboard/domains pages live-aggregate
  straight from the Email table via bucket_case()).

This module replaces all of that with a single atomic
`INSERT ... ON DUPLICATE KEY UPDATE` per table (MySQL), used identically by
both the sync (bulk processing) and async (FastAPI request) code paths.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from schemas.schemas import EmailVerifyResponse
from utils.logging import get_logger

logger = get_logger(__name__)


_EMAIL_UPSERT_SQL = text("""
    INSERT INTO emails
        (email, domain, status, syntax_valid, domain_exists, mx_found, smtp_valid,
         disposable, role_based, catch_all, score, job_id, verified_at, created_at, updated_at)
    VALUES
        (:email, :domain, :status, :syntax_valid, :domain_exists, :mx_found, :smtp_valid,
         :disposable, :role_based, :catch_all, :score, :job_id, :verified_at, :now, :now)
    ON DUPLICATE KEY UPDATE
        domain = VALUES(domain),
        status = VALUES(status),
        syntax_valid = VALUES(syntax_valid),
        domain_exists = VALUES(domain_exists),
        mx_found = VALUES(mx_found),
        smtp_valid = VALUES(smtp_valid),
        disposable = VALUES(disposable),
        role_based = VALUES(role_based),
        catch_all = VALUES(catch_all),
        score = VALUES(score),
        job_id = VALUES(job_id),
        verified_at = VALUES(verified_at),
        updated_at = VALUES(updated_at)
""")

# NOTE: intentionally does NOT touch verified_count / invalid_count /
# risky_count / bounce_rate — those columns are dead reads (nothing in the
# app queries them; dashboard/domains pages aggregate live from `emails`).
# Writing them on every single verification was pure overhead for data that
# was never used, and three different code paths disagreed on how to
# maintain them. mx_records uses COALESCE so a caller that didn't actually
# perform a fresh DNS lookup (mx_records=None, e.g. the trusted-domain fast
# path) never clobbers a previously known-good value.
_DOMAIN_UPSERT_SQL = text("""
    INSERT INTO domains (domain, mx_records, total_emails, created_at, updated_at)
    VALUES (:domain, :mx_records, 1, :now, :now)
    ON DUPLICATE KEY UPDATE
        mx_records = COALESCE(VALUES(mx_records), mx_records),
        total_emails = total_emails + 1,
        updated_at = VALUES(updated_at)
""")


def _email_params(result: EmailVerifyResponse, job_id: Optional[str], now: datetime) -> dict:
    return {
        "email": result.email,
        "domain": result.domain,
        "status": result.status.value,
        "syntax_valid": result.syntax_valid,
        "domain_exists": result.domain_exists,
        "mx_found": result.mx_found,
        "smtp_valid": result.smtp_valid,
        "disposable": result.disposable,
        "role_based": result.role_based,
        "catch_all": result.catch_all,
        "score": result.score,
        "job_id": job_id,
        "verified_at": result.verified_at.replace(tzinfo=None) if result.verified_at else None,
        "now": now,
    }


def _email_params_processing(email: str, domain: str, job_id: Optional[str], now: datetime) -> dict:
    """Parameters for inserting/updating an email with 'processing' status."""
    from models.models import EmailStatus
    return {
        "email": email,
        "domain": domain,
        "status": EmailStatus.processing.value,
        "syntax_valid": False,
        "domain_exists": False,
        "mx_found": False,
        "smtp_valid": False,
        "disposable": False,
        "role_based": False,
        "catch_all": False,
        "score": 0,
        "job_id": job_id,
        "verified_at": None,
        "now": now,
    }


def _domain_params(domain: str, mx_records: Optional[list[str]], now: datetime) -> dict:
    return {
        "domain": domain,
        "mx_records": json.dumps(mx_records) if mx_records is not None else None,
        "now": now,
    }


# ── Async (FastAPI request handlers) ────────────────────────────────────────

async def async_upsert_email(
    db: AsyncSession, result: EmailVerifyResponse, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row. Race-safe under concurrent
    requests for the same address (no check-then-insert window)."""
    await db.execute(_EMAIL_UPSERT_SQL, _email_params(result, job_id, now))


async def async_upsert_email_processing(
    db: AsyncSession, email: str, domain: str, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row with 'processing' status.
    Called before verification starts so the UI can show 'Processing' immediately.
    """
    await db.execute(_EMAIL_UPSERT_SQL, _email_params_processing(email, domain, job_id, now))


async def async_upsert_domain(
    db: AsyncSession, domain: str, mx_records: Optional[list[str]], now: datetime
) -> None:
    """Atomically insert-or-update a Domain row's total_emails + mx_records."""
    try:
        await db.execute(_DOMAIN_UPSERT_SQL, _domain_params(domain, mx_records, now))
    except Exception as exc:
        # Domain bookkeeping is best-effort — never let it fail the main
        # email verification/persistence flow.
        logger.warning("domain_upsert_failed", domain=domain, error=str(exc))


# ── Sync (bulk / background thread pool processing) ─────────────────────────

def sync_upsert_email(
    db: Session, result: EmailVerifyResponse, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row (sync session variant)."""
    db.execute(_EMAIL_UPSERT_SQL, _email_params(result, job_id, now))


def sync_upsert_email_processing(
    db: Session, email: str, domain: str, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row with 'processing' status (sync variant)."""
    db.execute(_EMAIL_UPSERT_SQL, _email_params_processing(email, domain, job_id, now))


def sync_upsert_domain(
    db: Session, domain: str, mx_records: Optional[list[str]], now: datetime
) -> None:
    """Atomically insert-or-update a Domain row's total_emails + mx_records (sync session variant)."""
    try:
        db.execute(_DOMAIN_UPSERT_SQL, _domain_params(domain, mx_records, now))
    except Exception as exc:
        logger.warning("domain_upsert_failed", domain=domain, error=str(exc))
