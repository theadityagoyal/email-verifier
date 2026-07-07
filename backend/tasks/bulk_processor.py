"""
Sync-compatible bulk processor using ThreadPoolExecutor.
Replaces Celery-based processing for simpler SaaS integration.
"""
import io
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pandas as pd
from sqlalchemy import select, text

from models.database import SyncSessionLocal
from models.models import Email, Domain, Job, EmailStatus, JobStatus
from services.email_service import verify_email
from utils.email_utils import detect_email_column
from utils.logging import get_logger
from utils.executor import get_executor

logger = get_logger(__name__)


IST = ZoneInfo("Asia/Kolkata")

def _ist_now():
    return datetime.now(IST).replace(tzinfo=None)


def verify_single_email_sync(email: str, job_id: str | None = None):
    """Verify a single email synchronously (for thread pool execution)."""
    import asyncio

    db = SyncSessionLocal()
    try:
        # Run async verify_email in new event loop
        loop = asyncio.new_event_loop()
        try:
            result = loop.run_until_complete(verify_email(email))
        finally:
            loop.close()

        existing = db.execute(
            select(Email).where(Email.email == email)
        ).scalar_one_or_none()

        now = _ist_now()

        if existing:
            existing.domain = result.domain
            existing.status = result.status
            existing.syntax_valid = result.syntax_valid
            existing.domain_exists = result.domain_exists
            existing.mx_found = result.mx_found
            existing.smtp_valid = result.smtp_valid
            existing.disposable = result.disposable
            existing.role_based = result.role_based
            existing.catch_all = result.catch_all
            existing.score = result.score
            existing.verified_at = (
                result.verified_at.replace(tzinfo=None)
                if result.verified_at
                else None
            )
            existing.updated_at = now
            existing.job_id = job_id
        else:
            db.add(Email(
                email=email,
                domain=result.domain,
                status=result.status,
                syntax_valid=result.syntax_valid,
                domain_exists=result.domain_exists,
                mx_found=result.mx_found,
                smtp_valid=result.smtp_valid,
                disposable=result.disposable,
                role_based=result.role_based,
                catch_all=result.catch_all,
                score=result.score,
                job_id=job_id,
                verified_at=(
                    result.verified_at.replace(tzinfo=None)
                    if result.verified_at
                    else None
                ),
            ))

        if result.domain:
            _update_domain_stats(db, result)

        if job_id:
            _update_job_counter(db, job_id, result.status)

        db.commit()
        return result.model_dump(mode="json")

    except Exception as exc:
        db.rollback()
        logger.error("verify_task_error", email=email, error=str(exc))
        raise
    finally:
        db.close()


def _update_domain_stats(db, result):
    """Update domain statistics atomically using MySQL ON DUPLICATE KEY UPDATE."""
    if not result.domain:
        return
    
    verified_inc = 1 if result.status in (EmailStatus.verified, EmailStatus.deliverable, EmailStatus.trusted, EmailStatus.probably_valid) else 0
    invalid_inc = 1 if result.status in (EmailStatus.invalid, EmailStatus.undeliverable) else 0
    risky_inc = 1 if result.status in (EmailStatus.risky, EmailStatus.unconfirmed, EmailStatus.uncertain) else 0

    sql = text("""
        INSERT INTO domains (domain, total_emails, verified_count, invalid_count, risky_count, bounce_rate, created_at, updated_at)
        VALUES (:domain, 1, :verified_inc, :invalid_inc, :risky_inc, 0.0, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            total_emails = total_emails + 1,
            verified_count = verified_count + :verified_inc,
            invalid_count = invalid_count + :invalid_inc,
            risky_count = risky_count + :risky_inc,
            bounce_rate = ROUND((invalid_count + :invalid_inc) / (total_emails + 1) * 100, 2),
            updated_at = NOW()
    """)
    db.execute(sql, {
        "domain": result.domain,
        "verified_inc": verified_inc,
        "invalid_inc": invalid_inc,
        "risky_inc": risky_inc,
    })


def _update_job_counter(db, job_id: str, status: EmailStatus):
    """Update job counters and progress for a single email verification result."""
    job = db.execute(
        select(Job).where(Job.job_id == job_id).with_for_update()
    ).scalar_one_or_none()

    if not job:
        return

    now = _ist_now()

    if job.started_at is None:
        job.started_at = now

    job.processed = (job.processed or 0) + 1

    if status in (EmailStatus.verified, EmailStatus.deliverable, EmailStatus.trusted, EmailStatus.probably_valid):
        job.verified = (job.verified or 0) + 1
    elif status in (EmailStatus.invalid, EmailStatus.undeliverable):
        job.invalid = (job.invalid or 0) + 1
    elif status in (EmailStatus.risky, EmailStatus.unconfirmed, EmailStatus.uncertain):
        job.risky = (job.risky or 0) + 1

    if job.total > 0:
        progress = (job.processed / job.total) * 100
        job.progress_percent = int(progress)

        if progress < 10:
            job.current_stage = 'uploading'
        elif progress < 40:
            job.current_stage = 'validating'
        elif progress < 80:
            job.current_stage = 'processing'
        elif progress < 100:
            job.current_stage = 'cleaning'
        else:
            job.current_stage = 'completed'

        if job.processed > 0:
            elapsed = (now - job.started_at).total_seconds()
            if elapsed > 0:
                rate = job.processed / elapsed
                if rate > 0:
                    remaining_seconds = (job.total - job.processed) / rate
                    job.estimated_time_remaining = int(remaining_seconds)
                else:
                    job.estimated_time_remaining = None
            else:
                job.estimated_time_remaining = None
        else:
            job.estimated_time_remaining = None

        if job.processed >= job.total:
            job.completed_at = now
            if job.current_stage != 'completed':
                job.current_stage = 'completed'
    else:
        job.progress_percent = 0
        job.estimated_time_remaining = None
        if job.processed >= job.total:
            job.completed_at = now
            job.current_stage = 'completed'


def process_bulk_job_sync(job_id: str, s3_key: str, email_col: str = "email"):
    """
    Process bulk job using ThreadPoolExecutor (synchronous, no Celery).
    This runs in a background thread pool worker thread from BackgroundTasks.
    """
    logger.info("process_bulk_job_sync_started", job_id=job_id)
    db = SyncSessionLocal()
    job = None
    try:
        job = db.execute(
            select(Job).where(Job.job_id == job_id)
        ).scalar_one_or_none()

        if not job:
            logger.error("job_not_found", job_id=job_id)
            return

        job.status = JobStatus.processing
        db.commit()

        # Load file
        if s3_key.startswith("local:"):
            path_part = s3_key.replace("local:", "")
            job_id_part, filename = path_part.split("/", 1)
            filepath = f"/tmp/uploads/{job_id_part}/{filename}"
            with open(filepath, "rb") as f:
                raw = f.read()
            filename_lower = filename.lower()
        else:
            from services.s3_service import download_file_from_s3
            raw = download_file_from_s3(s3_key)
            filename_lower = job.file_name.lower()

        # Read file — CSV or Excel
        if filename_lower.endswith(".csv"):
            for encoding in ["utf-8", "latin-1", "cp1252"]:
                try:
                    df = pd.read_csv(io.BytesIO(raw), encoding=encoding)
                    break
                except UnicodeDecodeError:
                    continue
                except Exception:
                    # Fallback: treat each line as a single column
                    try:
                        text = raw.decode(encoding, errors="replace")
                    except UnicodeDecodeError:
                        text = raw.decode("utf-8", errors="replace")
                    lines = [line.strip() for line in text.splitlines() if line.strip() != ""]
                    if not lines:
                        df = pd.DataFrame(columns=["email"])
                        break
                    header = lines[0]
                    data_lines = lines[1:] if "@" not in header or header.lower().startswith("email") else lines
                    col_name = "email" if header.lower() == "email" else header
                    df = pd.DataFrame({col_name: data_lines})
                    break
        else:
            df = pd.read_excel(io.BytesIO(raw))

        # Use provided email_col or auto detect
        if email_col not in df.columns:
            email_col = detect_email_column(df)

        emails = (
            df[email_col]
            .dropna()
            .astype(str)
            .str.strip()
            .str.lower()
            .unique()
            .tolist()
        )
        emails = [e for e in emails if "@" in e]

        # Source of truth for the progress denominator. Whatever estimate the
        # upload endpoint may have stored, this guarantees job.total always
        # matches the actual number of emails this run will process — fixes
        # progress_percent staying stuck at 0 when that earlier value was
        # missing/incorrect.
        job.total = len(emails)

        job.processed = 0
        job.verified = 0
        job.invalid = 0
        job.risky = 0
        db.commit()

        logger.info("bulk_job_processing", job_id=job_id, count=len(emails))

        # Process emails in parallel using ThreadPoolExecutor
        executor = get_executor()
        futures = {executor.submit(verify_single_email_sync, email, job_id): email for email in emails}

        for future in as_completed(futures):
            email = futures[future]
            try:
                future.result()
            except Exception as e:
                logger.error("email_verification_failed", email=email, error=str(e))

        # Mark job as completed
        job.status = JobStatus.completed
        job.completed_at = _ist_now()
        job.current_stage = 'completed'
        job.progress_percent = 100
        db.commit()

        logger.info("bulk_job_completed", job_id=job_id, total=len(emails))

    except Exception as exc:
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            db.commit()
        logger.error("bulk_job_error", job_id=job_id, error=str(exc))
        raise
    finally:
        db.close()
