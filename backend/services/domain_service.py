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

UPDATE (smart verification reuse): now also persists dns_checked_at /
smtp_checked_at — the TTL bookkeeping columns that let email_service.py
decide whether a future verification of the same address can skip real
DNS/SMTP I/O.

BUGFIX (smart verification reuse): the "mark processing" pre-step (called
right before a verification starts, purely for immediate UI feedback) used
to share the SAME upsert statement as the final-result save, which sets
domain_exists/mx_found/smtp_valid/catch_all/score via `= VALUES(...)`
(direct overwrite, not COALESCE). That meant every time an ALREADY-VERIFIED
email was re-submitted (e.g. a second bulk upload containing an overlapping
address), the pre-mark step silently wiped its real domain_exists/mx_found/
smtp_valid/catch_all/score back to False/0 BEFORE email_service.py's reuse
logic ever got a chance to read the existing row — so every reuse decision
was reading corrupted (just-zeroed) data instead of the real prior result.
This bug pre-dates the reuse feature (the shared upsert always had this
wipe behavior) but was harmless before since nothing ever trusted the
interim "processing" row's field values. It matters now.

Fix: mark-processing has its own dedicated SQL that only ever touches
`status`, `job_id`, and `updated_at` on an UPDATE — every other column
(domain_exists, mx_found, smtp_valid, catch_all, score, disposable,
role_based, syntax_valid, verified_at, dns_checked_at, smtp_checked_at) is
left completely untouched when the row already exists. On a genuine INSERT
(brand new email, first time ever seen) it still creates a full zero-value
row with status='processing', same as before.
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


# ── Final verification result upsert ────────────────────────────────────────
# Used ONLY when a verification has actually completed (email_service.py's
# _persist_result). Full overwrite of every signal column is correct here —
# this IS the new source of truth for the email.
_EMAIL_UPSERT_SQL = text("""
    INSERT INTO emails
        (email, domain, status, syntax_valid, domain_exists, mx_found, smtp_valid,
         disposable, role_based, catch_all, score, job_id, verified_at,
         dns_checked_at, smtp_checked_at, smtp_outcome, smtp_response_code,
         sub_status, confidence, reason_code,
         spf_valid, dmarc_valid,
         created_at, updated_at)
    VALUES
        (:email, :domain, :status, :syntax_valid, :domain_exists, :mx_found, :smtp_valid,
         :disposable, :role_based, :catch_all, :score, :job_id, :verified_at,
         :dns_checked_at, :smtp_checked_at, :smtp_outcome, :smtp_response_code,
         :sub_status, :confidence, :reason_code,
         :spf_valid, :dmarc_valid,
         :now, :now)
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
        dns_checked_at = COALESCE(VALUES(dns_checked_at), dns_checked_at),
        smtp_checked_at = COALESCE(VALUES(smtp_checked_at), smtp_checked_at),
        smtp_outcome = VALUES(smtp_outcome),
        smtp_response_code = VALUES(smtp_response_code),
        sub_status = VALUES(sub_status),
        confidence = VALUES(confidence),
        reason_code = VALUES(reason_code),
        spf_valid = VALUES(spf_valid),
        dmarc_valid = VALUES(dmarc_valid),
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
        "dns_checked_at": result.dns_checked_at.replace(tzinfo=None) if result.dns_checked_at else None,
        "smtp_checked_at": result.smtp_checked_at.replace(tzinfo=None) if result.smtp_checked_at else None,
        "smtp_outcome": result.smtp_outcome,
        "smtp_response_code": result.smtp_response_code,
        "sub_status": result.sub_status,
        "confidence": result.confidence,
        "reason_code": result.reason_code,
        "spf_valid": result.spf_valid,
        "dmarc_valid": result.dmarc_valid,
        "now": now,
    }


# ── "Mark processing" pre-step upsert ───────────────────────────────────────
# BUGFIX: does NOT touch domain_exists/mx_found/smtp_valid/disposable/
# role_based/catch_all/score/verified_at/dns_checked_at/smtp_checked_at on
# an existing row — only flips status to 'processing' and stamps the new
# job_id. On first-ever INSERT for a brand new email, still creates the
# full zero-value placeholder row exactly as before.
_EMAIL_MARK_PROCESSING_SQL = text("""
    INSERT INTO emails
        (email, domain, status, syntax_valid, domain_exists, mx_found, smtp_valid,
         disposable, role_based, catch_all, score, job_id, verified_at,
         dns_checked_at, smtp_checked_at, created_at, updated_at)
    VALUES
        (:email, :domain, :status, 0, 0, 0, 0, 0, 0, 0, 0, :job_id, NULL, NULL, NULL, :now, :now)
    ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        job_id = VALUES(job_id),
        updated_at = VALUES(updated_at)
""")

# NOTE: intentionally does NOT touch verified_count / invalid_count /
# risky_count / bounce_rate — those columns are dead reads (nothing in the
# app queries them; dashboard/domains pages aggregate live from `emails`).
# Writing them on every single verification was pure overhead for data that
# was never used, and three different code paths disagreed on how to
# maintain them. mx_records uses COALESCE so a caller that didn't actually
# perform a fresh DNS lookup (mx_records=None, e.g. the trusted-domain fast
# path, OR a reused/cached DNS decision) never clobbers a previously
# known-good value.
_DOMAIN_UPSERT_SQL = text("""
    INSERT INTO domains (domain, mx_records, total_emails, created_at, updated_at)
    VALUES (:domain, :mx_records, 1, :now, :now)
    ON DUPLICATE KEY UPDATE
        mx_records = COALESCE(VALUES(mx_records), mx_records),
        total_emails = total_emails + 1,
        updated_at = VALUES(updated_at)
""")


def _email_params_processing(email: str, domain: str, job_id: Optional[str], now: datetime) -> dict:
    """Parameters for the mark-processing pre-step. Only email/domain/status/
    job_id/now are actually referenced by _EMAIL_MARK_PROCESSING_SQL — every
    signal column on an existing row is left untouched (see module docstring
    BUGFIX note)."""
    from models.models import EmailStatus
    return {
        "email": email,
        "domain": domain,
        "status": EmailStatus.processing.value,
        "job_id": job_id,
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
    """Atomically insert-or-update an Email row with the FINAL result.
    Race-safe under concurrent requests for the same address (no
    check-then-insert window)."""
    await db.execute(_EMAIL_UPSERT_SQL, _email_params(result, job_id, now))


async def async_upsert_email_processing(
    db: AsyncSession, email: str, domain: str, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row with 'processing' status.
    Called before verification starts so the UI can show 'Processing'
    immediately. Does NOT wipe any existing verification result — see
    module docstring BUGFIX note."""
    await db.execute(_EMAIL_MARK_PROCESSING_SQL, _email_params_processing(email, domain, job_id, now))


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
# NOTE: these sync helpers are still used for the "mark processing" pre-step
# in tasks/bulk_processor.py (kept on the sync session for consistency with
# the rest of that module's DB access). The FINAL result upsert for bulk
# jobs now happens inside services/email_service.py (async, shared with the
# single-verify / external API paths) — see verify_single_email_sync() in
# bulk_processor.py, which no longer calls sync_upsert_email/sync_upsert_domain.

def sync_upsert_email(
    db: Session, result: EmailVerifyResponse, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row with the FINAL result (sync
    session variant)."""
    db.execute(_EMAIL_UPSERT_SQL, _email_params(result, job_id, now))


def sync_upsert_email_processing(
    db: Session, email: str, domain: str, job_id: Optional[str], now: datetime
) -> None:
    """Atomically insert-or-update an Email row with 'processing' status
    (sync variant). Does NOT wipe any existing verification result — see
    module docstring BUGFIX note."""
    db.execute(_EMAIL_MARK_PROCESSING_SQL, _email_params_processing(email, domain, job_id, now))


def sync_upsert_domain(
    db: Session, domain: str, mx_records: Optional[list[str]], now: datetime
) -> None:
    """Atomically insert-or-update a Domain row's total_emails + mx_records (sync session variant)."""
    try:
        db.execute(_DOMAIN_UPSERT_SQL, _domain_params(domain, mx_records, now))
    except Exception as exc:
        logger.warning("domain_upsert_failed", domain=domain, error=str(exc))
