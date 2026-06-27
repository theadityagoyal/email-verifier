import asyncio
import io
import os
from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select

from tasks.celery_app import celery_app
from models.database import SyncSessionLocal
from models.models import Email, Domain, Job, EmailStatus, JobStatus
from services.email_service import verify_email
from utils.logging import get_logger
from utils.email_utils import detect_email_column

logger = get_logger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(bind=True, max_retries=3, default_retry_delay=5)
def verify_single_email_task(self, email: str, job_id: str | None = None):
    db = SyncSessionLocal()
    try:
        result = _run_async(verify_email(email))

        existing = db.execute(
            select(Email).where(Email.email == email)
        ).scalar_one_or_none()

        now = datetime.now(timezone.utc)

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
            existing.verified_at = result.verified_at
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
                verified_at=result.verified_at,
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
        raise self.retry(exc=exc)
    finally:
        db.close()


def _update_domain_stats(db, result):
    domain_rec = db.execute(
        select(Domain).where(Domain.domain == result.domain)
    ).scalar_one_or_none()

    if not domain_rec:
        domain_rec = Domain(domain=result.domain, total_emails=0,
                            verified_count=0, invalid_count=0,
                            risky_count=0, bounce_rate=0.0)
        db.add(domain_rec)
        db.flush()

    domain_rec.total_emails = (domain_rec.total_emails or 0) + 1

    # Verified statuses
    if result.status in (EmailStatus.verified, EmailStatus.deliverable,
                         EmailStatus.trusted):
        domain_rec.verified_count = (domain_rec.verified_count or 0) + 1
    # Invalid statuses
    elif result.status in (EmailStatus.invalid, EmailStatus.undeliverable):
        domain_rec.invalid_count = (domain_rec.invalid_count or 0) + 1
    # Risky statuses
    elif result.status in (EmailStatus.risky, EmailStatus.probably_valid,
                           EmailStatus.unconfirmed, EmailStatus.uncertain):
        domain_rec.risky_count = (domain_rec.risky_count or 0) + 1

    total = domain_rec.total_emails or 1
    domain_rec.bounce_rate = round(
        (domain_rec.invalid_count or 0) / total * 100, 2
    )


def _update_job_counter(db, job_id: str, status: EmailStatus):
    """Update job counters and progress for a single email verification result."""
    # Lock the row for update to prevent race conditions
    job = db.execute(
        select(Job).where(Job.job_id == job_id).with_for_update()
    ).scalar_one_or_none()

    if not job:
        return

    now = datetime.now(timezone.utc)

    if job.started_at is None:
        job.started_at = now

    # Increment processed count
    job.processed = (job.processed or 0) + 1

    # Update specific counters based on status
    if status in (EmailStatus.verified, EmailStatus.deliverable,
                  EmailStatus.trusted):
        job.verified = (job.verified or 0) + 1
    elif status in (EmailStatus.invalid, EmailStatus.undeliverable):
        job.invalid = (job.invalid or 0) + 1
    elif status in (EmailStatus.risky, EmailStatus.probably_valid,
                    EmailStatus.unconfirmed, EmailStatus.uncertain):
        job.risky = (job.risky or 0) + 1

    # Update progress and stage
    if job.total > 0:
        progress = (job.processed / job.total) * 100
        job.progress_percent = int(progress)  # store as integer

        # Update stage based on progress
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

        # Update estimated time remaining
        if job.processed > 0:
            elapsed = (now - job.started_at).total_seconds()
            if elapsed > 0:
                rate = job.processed / elapsed  # emails per second
                if rate > 0:
                    remaining_seconds = (job.total - job.processed) / rate
                    job.estimated_time_remaining = int(remaining_seconds)
                else:
                    job.estimated_time_remaining = None
            else:
                job.estimated_time_remaining = None
        else:
            job.estimated_time_remaining = None

        # If completed, set completed_at
        if job.processed >= job.total:
            job.completed_at = now
            # Ensure stage is set to completed
            if job.current_stage != 'completed':
                job.current_stage = 'completed'
    else:
        # No total set (should not happen if job.total is set in bulk_upload)
        job.progress_percent = 0
        job.estimated_time_remaining = None
        if job.processed >= job.total:
            job.completed_at = now
            job.current_stage = 'completed'
@celery_app.task(bind=True)
def process_bulk_job(self, job_id: str, s3_key: str, email_col: str = "email"):
    """Download file, detect email column, fan out verify tasks."""
    logger.info("process_bulk_job_started", job_id=job_id)
    db = SyncSessionLocal()
    logger.info("database_session_created", job_id=job_id)
    job = None
    try:
        job = db.execute(
            select(Job).where(Job.job_id == job_id)
        ).scalar_one_or_none()
        logger.info("job_query_completed", job_id=job_id, job_found=job is not None)

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
        else:
            df = pd.read_excel(io.BytesIO(raw))

        # Use provided email_col or auto detect via shared utility
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
        # Filter only valid looking emails
        emails = [e for e in emails if "@" in e]

        # Keep total as set by API; only reset progress counters
        job.processed = 0
        job.verified = 0
        job.invalid = 0
        job.risky = 0
        db.commit()

        for email in emails:
            verify_single_email_task.delay(email, job_id)

        logger.info("bulk_job_dispatched", job_id=job_id, count=len(emails))

    except Exception as exc:
        db.rollback()
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            db.commit()
        logger.error("bulk_job_error", job_id=job_id, error=str(exc))
        raise
    finally:
        db.close()