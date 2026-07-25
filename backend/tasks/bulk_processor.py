"""
Sync-compatible bulk processor using ThreadPoolExecutor.

FIX (stuck-job audit):
  - Job counters now updated via ATOMIC SQL increments (no SELECT ... FOR
    UPDATE, no read-modify-write from 20 concurrent threads). Removes the
    row-lock contention that could cause "Lock wait timeout exceeded" and
    silently lost counter increments under load.
  - job.status is now guaranteed to reach a terminal value
    (completed/failed/cancelled) no matter what happens in the loop —
    wrapped so an exception after the loop can never leave a job stuck at
    'processing'.
  - Cancel check interval lowered + also checked at least once even for
    small jobs (previously a job with total < CANCEL_CHECK_INTERVAL could
    never be cancelled mid-flight).
"""
import asyncio
import threading
from datetime import datetime

from sqlalchemy import select, update, case

from models.database import SyncSessionLocal
from models.models import Job, JobStatus, EmailStatus, NotificationType, NotificationPriority
from services.email_service import verify_email
from services.domain_service import sync_upsert_email_processing
from services.notification_service import sync_create_notification
from utils.email_utils import detect_email_column
from utils.file_utils import read_upload_file, FileReadError
from utils.logging import get_logger
from utils.executor import get_executor, init_executor
from utils.timezone import utc_now_naive

logger = get_logger(__name__)

# FIX: lowered from 10 -> 3. A job with total < old interval (e.g. a 5-row
# test upload) previously could NEVER be cancelled mid-flight — the only
# check was the unconditional one AFTER the whole loop finished (i.e. after
# everything already ran). 3 means even small jobs get at least one
# mid-flight check for anything with total >= 3, and the final check still
# covers everything else.
CANCEL_CHECK_INTERVAL = 3

_thread_local = threading.local()


def _get_thread_event_loop() -> asyncio.AbstractEventLoop:
    loop = getattr(_thread_local, "loop", None)
    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        _thread_local.loop = loop
    return loop


def _is_cancel_requested(job_id: str) -> bool:
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


def verify_single_email_sync(email: str, job_id: str | None = None, force_fresh: bool = False):
    """Verify a single email synchronously (for thread pool execution)."""
    db = SyncSessionLocal()
    domain = email.split('@')[-1].lower() if '@' in email else ''
    now = utc_now_naive()
    try:
        try:
            sync_upsert_email_processing(db, email, domain, job_id, now)
            db.commit()
        except Exception as processing_error:
            db.rollback()
            logger.warning(
                f"Failed to mark email as processing for {email}: {str(processing_error)}",
                exc_info=False,
            )

        loop = _get_thread_event_loop()
        result = loop.run_until_complete(verify_email(email, job_id=job_id, force_fresh=force_fresh))

        if job_id:
            _update_job_counter(db, job_id, result)

        return result.model_dump(mode="json")

    except Exception as exc:
        db.rollback()
        logger.error("verify_task_error", email=email, error=str(exc), exc_info=True)
        raise
    finally:
        db.close()


def _update_job_counter(db, job_id: str, result) -> None:
    """
    Atomically increment job counters via a single UPDATE using SQL
    expressions (Job.processed + 1, etc). No SELECT ... FOR UPDATE, no
    Python-side read-modify-write — this is what actually removes the
    row-lock contention/serialization bug: 20 concurrent worker threads can
    all issue this UPDATE, MySQL handles the row lock internally for the
    duration of a single statement/commit only, not for the lifetime of an
    app-level transaction.
    """
    status = result.status
    now = utc_now_naive()

    verified_inc = 1 if status in (
        EmailStatus.verified, EmailStatus.deliverable, EmailStatus.trusted, EmailStatus.probably_valid
    ) else 0
    invalid_inc = 1 if status in (EmailStatus.invalid, EmailStatus.undeliverable) else 0
    risky_inc = 1 if status in (EmailStatus.risky, EmailStatus.unconfirmed, EmailStatus.uncertain) else 0

    dns_satisfied = (not result.dns_check_applicable) or result.dns_reused
    smtp_satisfied = (not result.smtp_check_applicable) or result.smtp_reused
    fully_reused = bool(result.record_existed and dns_satisfied and smtp_satisfied)

    reused_inc = 1 if fully_reused else 0
    newly_inc = 0 if fully_reused else 1
    dns_saved_inc = 1 if (result.dns_check_applicable and result.dns_reused) else 0
    smtp_saved_inc = 1 if (result.smtp_check_applicable and result.smtp_reused) else 0

    try:
        db.execute(
            update(Job)
            .where(Job.job_id == job_id)
            .values(
                processed=Job.processed + 1,
                verified=Job.verified + verified_inc,
                invalid=Job.invalid + invalid_inc,
                risky=Job.risky + risky_inc,
                reused_results=Job.reused_results + reused_inc,
                newly_verified=Job.newly_verified + newly_inc,
                dns_checks_saved=Job.dns_checks_saved + dns_saved_inc,
                smtp_checks_saved=Job.smtp_checks_saved + smtp_saved_inc,
                started_at=case((Job.started_at.is_(None), now), else_=Job.started_at),
            )
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("job_counter_increment_failed", job_id=job_id, error=str(exc), exc_info=True)
        return

    # Second, lightweight pass: read the now-authoritative processed/total
    # to compute progress %, stage, and ETA. This is a plain SELECT (no
    # lock), safe to run right after the increment commit above.
    try:
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if not job:
            return

        if job.total > 0:
            progress = min(100, int((job.processed / job.total) * 100))
            job.progress_percent = progress

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

            if job.processed > 0 and job.started_at:
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

            # NOTE: we deliberately do NOT set job.status here. Status is
            # ALWAYS decided by process_bulk_job_sync after the full loop
            # exits (see "guaranteed terminal status" block below) — that
            # is the single source of truth for status, avoiding the old
            # split-brain bug where current_stage said 'completed' while
            # status stayed 'processing'.
            if job.processed >= job.total and not job.completed_at:
                job.completed_at = now
        else:
            job.progress_percent = 0
            job.estimated_time_remaining = None

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("job_progress_update_failed", job_id=job_id, error=str(exc))


def process_bulk_job_sync(job_id: str, s3_key: str, email_col: str = "email", force_fresh: bool = False) -> None:
    """
    Process bulk job using ThreadPoolExecutor (synchronous, no Celery).

    FIX: this function now GUARANTEES the job reaches a terminal status
    (completed / failed / cancelled) before returning, via a try/finally
    safety net at the bottom. Previously, an exception raised after the
    as_completed() loop (e.g. during notification creation, cache-hit-rate
    calc, or the final commit) could leave a job permanently stuck at
    'processing' with no code path to ever revisit it. Combined with the
    startup reconciliation added in main.py, orphaned jobs (e.g. from a
    server crash/restart mid-job) are now also cleaned up.
    """
    logger.info("process_bulk_job_sync_started", job_id=job_id)
    db = SyncSessionLocal()
    job = None
    reached_terminal_state = False
    try:
        job = db.execute(
            select(Job).where(Job.job_id == job_id)
        ).scalar_one_or_none()

        if not job:
            logger.error("job_not_found", job_id=job_id)
            return

        job.status = JobStatus.processing
        db.commit()

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

        df = read_upload_file(raw, filename_for_parsing)

        if email_col not in df.columns:
            email_col = detect_email_column(df)

        raw_series = (
            df[email_col]
            .dropna()
            .astype(str)
            .str.strip()
            .str.lower()
        )
        with_at = raw_series[raw_series.str.contains("@")]
        total_before_dedup = len(with_at)
        emails = with_at.unique().tolist()
        duplicate_emails_removed = total_before_dedup - len(emails)

        job.total = len(emails)
        job.duplicate_emails_removed = duplicate_emails_removed
        job.processed = 0
        job.verified = 0
        job.invalid = 0
        job.risky = 0
        job.reused_results = 0
        job.newly_verified = 0
        job.dns_checks_saved = 0
        job.smtp_checks_saved = 0
        job.started_at = utc_now_naive()
        db.commit()

        logger.info(
            "bulk_job_processing",
            job_id=job_id,
            count=len(emails),
            duplicate_emails_removed=duplicate_emails_removed,
        )

        try:
            executor = get_executor()
        except RuntimeError:
            logger.warning("Executor not initialized, initializing now")
            executor = init_executor()

        from concurrent.futures import as_completed

        futures = {executor.submit(verify_single_email_sync, email, job_id, force_fresh=job.force_fresh): email for email in emails}

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

        # Final authoritative check.
        if cancelled or _is_cancel_requested(job_id):
            db.refresh(job)
            job.status = JobStatus.cancelled
            job.completed_at = utc_now_naive()
            job.current_stage = 'cancelled'
            db.commit()
            reached_terminal_state = True

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

        # Mark job as completed — re-read the row first so we don't clobber
        # counters written by other sessions with a stale ORM snapshot.
        db.refresh(job)
        job.status = JobStatus.completed
        job.completed_at = job.completed_at or utc_now_naive()
        job.current_stage = 'completed'
        job.progress_percent = 100
        db.commit()
        reached_terminal_state = True

        logger.info(
            "bulk_job_completed",
            job_id=job_id,
            total=len(emails),
            reused_results=job.reused_results,
            newly_verified=job.newly_verified,
            dns_checks_saved=job.dns_checks_saved,
            smtp_checks_saved=job.smtp_checks_saved,
        )

        cache_hit_rate = round((job.reused_results / job.total * 100), 1) if job.total else 0.0

        sync_create_notification(
            db,
            title="Bulk Upload Completed",
            message=(
                f'"{job.file_name}" finished — {job.verified} safe, '
                f'{job.risky} risky, {job.invalid} unsafe out of {job.total} '
                f'({job.reused_results} reused, {cache_hit_rate}% cache hit rate).'
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
                "duplicate_emails_removed": job.duplicate_emails_removed,
                "reused_results": job.reused_results,
                "newly_verified": job.newly_verified,
                "dns_checks_saved": job.dns_checks_saved,
                "smtp_checks_saved": job.smtp_checks_saved,
                "cache_hit_rate": cache_hit_rate,
            },
        )

    except FileReadError as exc:
        if job:
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": "FileReadError"}
            db.commit()
            reached_terminal_state = True
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
            try:
                job.status = JobStatus.failed
                job.error_message = str(exc)
                job.error_details = {"error": str(exc), "type": type(exc).__name__}
                db.commit()
                reached_terminal_state = True
            except Exception as commit_exc:
                # Even the failure-commit failed (e.g. connection dropped).
                # Roll back and try once more with a fresh session so the
                # job NEVER stays stuck at 'processing'.
                db.rollback()
                logger.error("bulk_job_failure_commit_failed", job_id=job_id, error=str(commit_exc))
                _force_mark_failed(job_id, str(exc))
                reached_terminal_state = True
            sync_create_notification(
                db,
                title="Bulk Upload Failed",
                message=f'"{job.file_name}" failed: {str(exc)}',
                type=NotificationType.error,
                priority=NotificationPriority.high,
                metadata={"job_id": job_id, "file_name": job.file_name, "error": str(exc)},
            )
        else:
            _force_mark_failed(job_id, str(exc))
            reached_terminal_state = True
        logger.error("bulk_job_error", job_id=job_id, error=str(exc), exc_info=True)
    finally:
        # Safety net: no matter what happened above, a job must NEVER be
        # left at 'pending'/'processing' when this function returns. This
        # is what actually closes the "stuck at Processing forever" bug for
        # any code path we didn't anticipate.
        if not reached_terminal_state:
            _force_mark_failed(job_id, "Job processing ended unexpectedly without reaching a terminal state.")
        db.close()


def _force_mark_failed(job_id: str, error_message: str) -> None:
    """Last-resort, isolated-session guarantee that a job is never left in
    a non-terminal state. Used only when the normal failure path itself
    could not commit."""
    fresh_db = SyncSessionLocal()
    try:
        j = fresh_db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if j and j.status not in (JobStatus.completed, JobStatus.failed, JobStatus.cancelled):
            j.status = JobStatus.failed
            j.error_message = error_message[:2000]
            j.error_details = {"error": error_message, "type": "ForcedTerminalState"}
            j.completed_at = utc_now_naive()
            fresh_db.commit()
            logger.warning("bulk_job_force_marked_failed", job_id=job_id)
    except Exception as exc:
        fresh_db.rollback()
        logger.error("bulk_job_force_mark_failed_error", job_id=job_id, error=str(exc), exc_info=True)
    finally:
        fresh_db.close()