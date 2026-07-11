"""
Sync-compatible bulk processor using ThreadPoolExecutor.
Replaces Celery-based processing for simpler SaaS integration.
"""
import asyncio
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from models.database import SyncSessionLocal
from models.models import Job, JobStatus
from services.email_service import verify_email
from services.domain_service import sync_upsert_email, sync_upsert_domain
from utils.email_utils import detect_email_column
from utils.file_utils import read_upload_file, FileReadError
from utils.logging import get_logger
from utils.executor import get_executor, init_executor

logger = get_logger(__name__)


IST = ZoneInfo("Asia/Kolkata")


def _ist_now():
    return datetime.now(IST).replace(tzinfo=None)


# ── Thread-local event loop reuse ────────────────────────────────────────────
# Each ThreadPoolExecutor worker thread is long-lived and processes many
# emails over its lifetime. Previously every single email verification
# created a brand-new asyncio event loop via asyncio.new_event_loop() and
# tore it down immediately after — for a bulk job of thousands of emails
# across ~20 worker threads, that's thousands of loop create/destroy cycles,
# a real performance bottleneck. Instead, each thread creates its event loop
# exactly once (on first use) and reuses it for every subsequent email it
# processes.
_thread_local = threading.local()


def _get_thread_event_loop() -> asyncio.AbstractEventLoop:
    loop = getattr(_thread_local, "loop", None)
    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        _thread_local.loop = loop
    return loop


def verify_single_email_sync(email: str, job_id: str | None = None):
    """Verify a single email synchronously (for thread pool execution)."""
    db = SyncSessionLocal()
    try:
        loop = _get_thread_event_loop()
        result = loop.run_until_complete(verify_email(email))

        now = _ist_now()

        # Atomic upsert — eliminates the check-then-insert race that could
        # previously raise an unhandled IntegrityError when the same email
        # appeared more than once across overlapping bulk jobs / concurrent
        # single-verify requests.
        sync_upsert_email(db, result, job_id, now)

        if result.domain:
            sync_upsert_domain(db, result.domain, result.mx_records, now)

        if job_id:
            _update_job_counter(db, job_id, result.status)

        db.commit()
        return result.model_dump(mode="json")

    except Exception as exc:
        db.rollback()
        logger.error("verify_task_error", email=email, error=str(exc), exc_info=True)
        raise
    finally:
        db.close()


def _update_job_counter(db, job_id: str, status) -> None:
    """Update job counters and progress for a single email verification result."""
    from models.models import EmailStatus  # local import to avoid unused-import churn elsewhere

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


def process_bulk_job_sync(job_id: str, s3_key: str, email_col: str = "email") -> None:
    """
    Process bulk job using ThreadPoolExecutor (synchronous, no Celery).
    This runs in a background thread pool worker thread from BackgroundTasks.

    Args:
        job_id: The unique identifier for the job
        s3_key: The S3 key (or local path indicator) of the file to process
        email_col: The column name containing email addresses (default: "email")
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
            filename_for_parsing = filename
        else:
            from services.s3_service import download_file_from_s3
            raw = download_file_from_s3(s3_key)
            filename_for_parsing = job.file_name

        # Read file — CSV or Excel (shared reader, same logic as the upload endpoints)
        df = read_upload_file(raw, filename_for_parsing)

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
        # percent staying stuck at 0 when that earlier value was
        # missing/incorrect.
        job.total = len(emails)

        job.processed = 0
        job.verified = 0
        job.invalid = 0
        job.risky = 0
        db.commit()

        logger.info("bulk_job_processing", job_id=job_id, count=len(emails))

        # Process emails in parallel using ThreadPoolExecutor
        try:
            executor = get_executor()
        except RuntimeError:
            logger.warning("Executor not initialized, initializing now")
            executor = init_executor()

        from concurrent.futures import as_completed

        futures = {executor.submit(verify_single_email_sync, email, job_id): email for email in emails}

        for future in as_completed(futures):
            email = futures[future]
            try:
                future.result()
            except Exception as e:
                logger.error("email_verification_failed", email=email, error=str(e), exc_info=True)

        # Mark job as completed
        job.status = JobStatus.completed
        job.completed_at = _ist_now()
        job.current_stage = 'completed'
        job.progress_percent = 100
        db.commit()

        logger.info("bulk_job_completed", job_id=job_id, total=len(emails))

    except FileReadError as exc:
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": "FileReadError"}
            db.commit()
        logger.error("bulk_job_file_read_error", job_id=job_id, error=str(exc), exc_info=True)
    except Exception as exc:
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": type(exc).__name__}
            db.commit()
        logger.error("bulk_job_error", job_id=job_id, error=str(exc), exc_info=True)
        raise
    finally:
        db.close()
