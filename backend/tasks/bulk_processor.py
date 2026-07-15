"""
Sync-compatible bulk processor using ThreadPoolExecutor.
Replaces Celery-based processing for simpler SaaS integration.
"""
import asyncio
import threading
from datetime import datetime

from sqlalchemy import select

from models.database import SyncSessionLocal
from models.models import Job, JobStatus, NotificationType, NotificationPriority
from services.email_service import verify_email
from services.domain_service import sync_upsert_email, sync_upsert_email_processing, sync_upsert_domain
from services.notification_service import sync_create_notification
from utils.email_utils import detect_email_column
from utils.file_utils import read_upload_file, FileReadError
from utils.logging import get_logger
from utils.executor import get_executor, init_executor
from utils.timezone import utc_now_naive

logger = get_logger(__name__)

# How many completed emails between each check of Job.cancel_requested.
# Small enough that a cancel request is honored quickly, large enough that
# it isn't hammering the DB with an extra query per email on top of the
# per-email upsert that already happens in verify_single_email_sync.
CANCEL_CHECK_INTERVAL = 10


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


def _is_cancel_requested(job_id: str) -> bool:
    """Fresh, isolated read of Job.cancel_requested.

    Uses its own short-lived session (open -> query -> close) instead of
    reusing process_bulk_job_sync's long-lived `db` session, so it always
    sees the latest value committed by the cancel endpoint's own request —
    regardless of what transaction/snapshot state the caller's session
    happens to be sitting in at the time.
    """
    db = SyncSessionLocal()
    try:
        value = db.execute(
            select(Job.cancel_requested).where(Job.job_id == job_id)
        ).scalar_one_or_none()
        return bool(value)
    except Exception as exc:
        logger.warning("cancel_flag_check_failed", job_id=job_id, error=str(exc))
        return False
    finally:
        db.close()


def verify_single_email_sync(email: str, job_id: str | None = None):
    """Verify a single email synchronously (for thread pool execution)."""
    db = SyncSessionLocal()
    domain = email.split('@')[-1].lower() if '@' in email else ''
    now = utc_now_naive()
    try:
        # First, insert with "processing" status for immediate UI feedback
        try:
            sync_upsert_email_processing(db, email, domain, job_id, now)
            db.commit()
        except Exception as processing_error:
            db.rollback()
            logger.warning(
                f"Failed to mark email as processing for {email}: {str(processing_error)}",
                exc_info=False,
            )
            # Continue anyway - verification will still run

        loop = _get_thread_event_loop()
        result = loop.run_until_complete(verify_email(email))

        now = utc_now_naive()

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

    now = utc_now_naive()

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

        # ── Cooperative cancellation ─────────────────────────────────────
        # `cancelled` short-circuits repeat DB checks once we've already
        # detected cancellation and cancelled the remaining futures — no
        # point re-checking every interval after that.
        cancelled = False
        completed_count = 0

        for future in as_completed(futures):
            email = futures[future]
            try:
                future.result()
            except Exception as e:
                logger.error("email_verification_failed", email=email, error=str(e), exc_info=True)

            completed_count += 1

            if not cancelled and completed_count % CANCEL_CHECK_INTERVAL == 0:
                if _is_cancel_requested(job_id):
                    cancelled = True
                    # Futures that haven't started yet get cancelled here and
                    # will never run — no email is processed for them, so
                    # nothing partial or corrupted is written for those.
                    # Futures already executing can't be interrupted
                    # mid-verification (deliberately — each one commits its
                    # own result independently via verify_single_email_sync,
                    # so letting in-flight work finish is exactly what keeps
                    # already-processed results consistent); as_completed()
                    # will simply yield them normally when they finish, which
                    # this same for-loop already handles above.
                    still_pending = sum(1 for f in futures if not f.done())
                    for pending_future in futures:
                        pending_future.cancel()
                    logger.info(
                        "bulk_job_cancellation_detected",
                        job_id=job_id,
                        processed_so_far=completed_count,
                        total=len(emails),
                        futures_cancelled=still_pending,
                    )

        # Final authoritative check — covers the case where cancellation was
        # requested after the very last CANCEL_CHECK_INTERVAL checkpoint but
        # before the job would otherwise be marked completed.
        if cancelled or _is_cancel_requested(job_id):
            db.refresh(job)  # pick up the latest processed/verified/invalid/risky
                              # counts written by the (separately-sessioned)
                              # per-email commits above before we report them
            job.status = JobStatus.cancelled
            job.completed_at = utc_now_naive()
            job.current_stage = 'cancelled'
            db.commit()

            logger.info(
                "bulk_job_cancelled",
                job_id=job_id,
                processed=job.processed,
                total=job.total,
            )
            sync_create_notification(
                db,
                title="Bulk Upload Cancelled",
                message=(
                    f'"{job.file_name}" was cancelled after processing '
                    f'{job.processed}/{job.total} emails.'
                ),
                type=NotificationType.warning,
                priority=NotificationPriority.medium,
                metadata={
                    "job_id": job_id,
                    "file_name": job.file_name,
                    "processed": job.processed,
                    "total": job.total,
                },
            )
            return

        # Mark job as completed
        job.status = JobStatus.completed
        job.completed_at = utc_now_naive()
        job.current_stage = 'completed'
        job.progress_percent = 100
        db.commit()

        logger.info("bulk_job_completed", job_id=job_id, total=len(emails))

        sync_create_notification(
            db,
            title="Bulk Upload Completed",
            message=(
                f'"{job.file_name}" finished — {job.verified} safe, '
                f'{job.risky} risky, {job.invalid} unsafe out of {job.total}.'
            ),
            type=NotificationType.success,
            priority=NotificationPriority.medium,
            metadata={
                "job_id": job_id,
                "file_name": job.file_name,
                "total": job.total,
                "verified": job.verified,
                "risky": job.risky,
                "invalid": job.invalid,
            },
        )

    except FileReadError as exc:
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": "FileReadError"}
            db.commit()
            sync_create_notification(
                db,
                title="Bulk Upload Failed",
                message=f'"{job.file_name}" failed — could not read the uploaded file: {str(exc)}',
                type=NotificationType.error,
                priority=NotificationPriority.high,
                metadata={"job_id": job_id, "file_name": job.file_name, "error": str(exc)},
            )
        logger.error("bulk_job_file_read_error", job_id=job_id, error=str(exc), exc_info=True)
    except Exception as exc:
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": type(exc).__name__}
            db.commit()
            sync_create_notification(
                db,
                title="Bulk Upload Failed",
                message=f'"{job.file_name}" failed: {str(exc)}',
                type=NotificationType.error,
                priority=NotificationPriority.high,
                metadata={"job_id": job_id, "file_name": job.file_name, "error": str(exc)},
            )
        logger.error("bulk_job_error", job_id=job_id, error=str(exc), exc_info=True)
        raise
    finally:
        db.close()
