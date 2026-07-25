"""
Sync-compatible bulk processor using ThreadPoolExecutor.
Replaces Celery-based processing for simpler SaaS integration.

FIX (2026-07-25 — "Lost connection to MySQL server during query" crashing
whole bulk jobs after 20-30+ min):

Root cause: process_bulk_job_sync() used to open ONE SyncSessionLocal()
session at the top and keep it alive for the ENTIRE job duration (can be
30+ min for large files). That session touched the DB only a few times
(load job, set totals) then sat mostly idle while the ThreadPoolExecutor
loop ran. MySQL/network killed the idle connection during that long idle
window. The next attribute access after commit (default
expire_on_commit=True on SyncSessionLocal) fired an implicit re-SELECT on
that dead connection and crashed — marking the whole job "Failed" even
though every email had already verified and persisted successfully
(each email's own result is saved via its own short-lived session inside
verify_single_email_sync / email_service.py, completely independent of
this outer `db` session).

Fix, two parts:
  1. models/database.py: SyncSessionLocal now expire_on_commit=False —
     stops the implicit re-SELECT after commit.
  2. THIS FILE: no single long-held `db` session anymore. Every DB
     touchpoint (load job, set processing, set totals, finalize
     cancelled/completed/failed) opens its OWN short-lived session via
     _run_with_retry(), which retries up to 3x with a fresh session on a
     transient "lost connection"/"server has gone away" error. Per-email
     work (verify_single_email_sync, _update_job_counter) already used its
     own short-lived session per call — unchanged, was never the problem.
"""
import asyncio
import threading
import time
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import OperationalError, DBAPIError

from models.database import SyncSessionLocal
from models.models import Job, JobStatus, NotificationType, NotificationPriority
from services.email_service import verify_email
from services.domain_service import sync_upsert_email_processing
from services.notification_service import sync_create_notification
from utils.email_utils import detect_email_column
from utils.file_utils import read_upload_file, FileReadError
from utils.logging import get_logger
from utils.executor import get_executor, init_executor
from utils.timezone import utc_now_naive

logger = get_logger(__name__)

# How many completed emails between each check of Job.cancel_requested.
CANCEL_CHECK_INTERVAL = 10

# ── DB retry-on-disconnect config ────────────────────────────────────────
MAX_DB_RETRIES = 3
DB_RETRY_DELAY_SECONDS = 1


def _is_transient_disconnect(exc: Exception) -> bool:
    """Best-effort check: was this a 'connection died on us' error (worth
    retrying with a fresh session) vs a real query/logic error (not worth
    retrying, would just fail again identically)."""
    if getattr(exc, "connection_invalidated", False):
        return True
    text = str(exc).lower()
    return "lost connection" in text or "server has gone away" in text or "broken pipe" in text


def _run_with_retry(fn, *args, **kwargs):
    """
    Run fn(db, *args, **kwargs) using a FRESH short-lived SyncSessionLocal
    for every attempt. Retries up to MAX_DB_RETRIES times if the DB
    connection was transiently lost (idle timeout, network blip) — never
    retries on a genuine query error.

    This — plus expire_on_commit=False on SyncSessionLocal — is what
    actually fixes the "job marked Failed after 30 min even though all
    1000 emails verified fine" bug: no session is ever held open across
    the whole job anymore, so there's nothing to go stale.
    """
    last_exc = None
    for attempt in range(1, MAX_DB_RETRIES + 1):
        db = SyncSessionLocal()
        try:
            result = fn(db, *args, **kwargs)
            return result
        except (OperationalError, DBAPIError) as exc:
            db.rollback()
            last_exc = exc
            if not _is_transient_disconnect(exc) or attempt == MAX_DB_RETRIES:
                raise
            logger.warning(
                "db_transient_disconnect_retry",
                attempt=attempt,
                max_attempts=MAX_DB_RETRIES,
                error=str(exc),
            )
            time.sleep(DB_RETRY_DELAY_SECONDS * attempt)
            continue
        finally:
            db.close()
    if last_exc:
        raise last_exc


# ── Thread-local event loop reuse ────────────────────────────────────────────
# Each ThreadPoolExecutor worker thread is long-lived and processes many
# emails over its lifetime. Each thread creates its event loop exactly once
# (on first use) and reuses it for every subsequent email it processes.
_thread_local = threading.local()


def _get_thread_event_loop() -> asyncio.AbstractEventLoop:
    loop = getattr(_thread_local, "loop", None)
    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        _thread_local.loop = loop
    return loop


def _is_cancel_requested(job_id: str) -> bool:
    """Fresh, isolated read of Job.cancel_requested, with retry-on-disconnect."""
    def _query(db, job_id):
        value = db.execute(
            select(Job.cancel_requested).where(Job.job_id == job_id)
        ).scalar_one_or_none()
        return bool(value)

    try:
        return _run_with_retry(_query, job_id)
    except Exception as exc:
        logger.warning("cancel_flag_check_failed", job_id=job_id, error=str(exc))
        return False


def verify_single_email_sync(email: str, job_id: str | None = None, force_fresh: bool = False):
    """Verify a single email synchronously (for thread pool execution).

    NOTE (smart verification reuse): the actual Email/Domain row persistence
    no longer happens here — services/email_service.verify_email() does it
    internally. This function still owns the "mark processing" pre-step and
    the job counters. Its own DB session here was ALREADY short-lived
    (opened/closed per call) — this was never part of the "lost connection"
    bug, left unchanged apart from routing through _run_with_retry for the
    same disconnect-safety.

    Args:
        force_fresh: If True, bypass TTL cache and force fresh DNS/SMTP checks
    """
    domain = email.split('@')[-1].lower() if '@' in email else ''
    now = utc_now_naive()

    def _mark_processing(db, email, domain, job_id, now):
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

    try:
        _run_with_retry(_mark_processing, email, domain, job_id, now)
    except Exception:
        # _mark_processing already swallows its own errors; this outer
        # try/except only guards against _run_with_retry exhausting
        # retries on a genuine disconnect — still fine to continue, the
        # real verification below doesn't depend on this pre-step.
        pass

    loop = _get_thread_event_loop()
    result = loop.run_until_complete(verify_email(email, job_id=job_id, force_fresh=force_fresh))

    if job_id:
        def _update(db, job_id, result):
            _update_job_counter(db, job_id, result)
            db.commit()

        try:
            _run_with_retry(_update, job_id, result)
        except Exception as exc:
            logger.error("job_counter_update_failed", email=email, job_id=job_id, error=str(exc), exc_info=True)
            # Don't raise — the email's own result already persisted via
            # verify_email()'s own upsert. Losing one counter update is far
            # better than crashing the whole job.

    return result.model_dump(mode="json")


def _update_job_counter(db, job_id: str, result) -> None:
    """Update job counters, progress, and smart-reuse metrics for a single
    email verification result. Caller owns commit()."""
    from models.models import EmailStatus  # local import to avoid unused-import churn elsewhere

    status = result.status

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

    dns_satisfied = (not result.dns_check_applicable) or result.dns_reused
    smtp_satisfied = (not result.smtp_check_applicable) or result.smtp_reused
    fully_reused = bool(result.record_existed and dns_satisfied and smtp_satisfied)

    if fully_reused:
        job.reused_results = (job.reused_results or 0) + 1
    else:
        job.newly_verified = (job.newly_verified or 0) + 1

    if result.dns_check_applicable and result.dns_reused:
        job.dns_checks_saved = (job.dns_checks_saved or 0) + 1
    if result.smtp_check_applicable and result.smtp_reused:
        job.smtp_checks_saved = (job.smtp_checks_saved or 0) + 1

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


def process_bulk_job_sync(job_id: str, s3_key: str, email_col: str = "email", force_fresh: bool = False) -> None:
    """
    Process bulk job using ThreadPoolExecutor (synchronous, no Celery).
    This runs in a background thread pool worker thread from BackgroundTasks.

    FIX: no single DB session lives across the whole job anymore. Every
    touchpoint below opens its own short-lived session via _run_with_retry.

    Args:
        job_id: The unique identifier for the job
        s3_key: The S3 key (or local path indicator) of the file to process
        email_col: The column name containing email addresses (default: "email")
        force_fresh: If True, bypass TTL cache and force fresh DNS/SMTP checks
    """
    logger.info("process_bulk_job_sync_started", job_id=job_id)

    # ── Step 1: load job, flip to processing ────────────────────────────
    def _load_and_mark_processing(db, job_id):
        job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
        if not job:
            return None
        job.status = JobStatus.processing
        db.commit()
        return {
            "s3_key": job.s3_key,
            "file_name": job.file_name,
            "force_fresh": job.force_fresh,
        }

    try:
        job_info = _run_with_retry(_load_and_mark_processing, job_id)
    except Exception as exc:
        logger.error("bulk_job_initial_load_failed", job_id=job_id, error=str(exc), exc_info=True)
        return

    if not job_info:
        logger.error("job_not_found", job_id=job_id)
        return

    try:
        # ── Load file ────────────────────────────────────────────────────
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
            filename_for_parsing = job_info["file_name"]

        df = read_upload_file(raw, filename_for_parsing)

        if email_col not in df.columns:
            email_col = detect_email_column(df)

        # ── Mandatory bulk dedup ─────────────────────────────────────────
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

        # ── Step 2: write real totals, reset counters ───────────────────
        def _set_totals(db, job_id, total, duplicate_emails_removed):
            job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
            if not job:
                return
            job.total = total
            job.duplicate_emails_removed = duplicate_emails_removed
            job.processed = 0
            job.verified = 0
            job.invalid = 0
            job.risky = 0
            job.reused_results = 0
            job.newly_verified = 0
            job.dns_checks_saved = 0
            job.smtp_checks_saved = 0
            db.commit()

        _run_with_retry(_set_totals, job_id, len(emails), duplicate_emails_removed)

        logger.info(
            "bulk_job_processing",
            job_id=job_id,
            count=len(emails),
            duplicate_emails_removed=duplicate_emails_removed,
        )

        # ── Process emails in parallel using ThreadPoolExecutor ─────────
        try:
            executor = get_executor()
        except RuntimeError:
            logger.warning("Executor not initialized, initializing now")
            executor = init_executor()

        from concurrent.futures import as_completed

        job_force_fresh = job_info["force_fresh"]
        futures = {executor.submit(verify_single_email_sync, email, job_id, force_fresh=job_force_fresh): email for email in emails}

        # ── Cooperative cancellation ─────────────────────────────────────
        # NOTE: this loop touches NO shared long-lived `db` session — every
        # email's own persistence + counter update happens inside
        # verify_single_email_sync via its own short-lived sessions. This
        # loop can safely run for 30+ minutes with zero idle DB connections
        # sitting around to go stale.
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

        # ── Step 3: finalize — cancelled ─────────────────────────────────
        if cancelled or _is_cancel_requested(job_id):
            def _finalize_cancelled(db, job_id):
                job = db.execute(select(Job).where(Job.job_id == job_id).with_for_update()).scalar_one_or_none()
                if not job:
                    return None
                job.status = JobStatus.cancelled
                job.completed_at = utc_now_naive()
                job.current_stage = 'cancelled'
                db.commit()
                return {
                    "file_name": job.file_name,
                    "processed": job.processed,
                    "total": job.total,
                }

            job_snapshot = _run_with_retry(_finalize_cancelled, job_id)

            if job_snapshot:
                logger.info(
                    "bulk_job_cancelled",
                    job_id=job_id,
                    processed=job_snapshot["processed"],
                    total=job_snapshot["total"],
                )

                def _notify_cancelled(db, job_snapshot):
                    sync_create_notification(
                        db,
                        title="Bulk Upload Cancelled",
                        message=(
                            f'"{job_snapshot["file_name"]}" was cancelled after processing '
                            f'{job_snapshot["processed"]}/{job_snapshot["total"]} emails.'
                        ),
                        type=NotificationType.warning,
                        priority=NotificationPriority.medium,
                        metadata={
                            "job_id": job_id,
                            "file_name": job_snapshot["file_name"],
                            "processed": job_snapshot["processed"],
                            "total": job_snapshot["total"],
                        },
                    )

                try:
                    _run_with_retry(_notify_cancelled, job_snapshot)
                except Exception as exc:
                    logger.warning("bulk_job_cancel_notification_failed", job_id=job_id, error=str(exc))
            return

        # ── Step 4: finalize — completed ──────────────────────────────────
        def _finalize_completed(db, job_id):
            job = db.execute(select(Job).where(Job.job_id == job_id).with_for_update()).scalar_one_or_none()
            if not job:
                return None
            job.status = JobStatus.completed
            job.completed_at = utc_now_naive()
            job.current_stage = 'completed'
            job.progress_percent = 100
            db.commit()
            return {
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
            }

        job_snapshot = _run_with_retry(_finalize_completed, job_id)

        if job_snapshot:
            logger.info(
                "bulk_job_completed",
                job_id=job_id,
                total=len(emails),
                reused_results=job_snapshot["reused_results"],
                newly_verified=job_snapshot["newly_verified"],
                dns_checks_saved=job_snapshot["dns_checks_saved"],
                smtp_checks_saved=job_snapshot["smtp_checks_saved"],
            )

            cache_hit_rate = round((job_snapshot["reused_results"] / job_snapshot["total"] * 100), 1) if job_snapshot["total"] else 0.0

            def _notify_completed(db, job_snapshot, cache_hit_rate):
                sync_create_notification(
                    db,
                    title="Bulk Upload Completed",
                    message=(
                        f'"{job_snapshot["file_name"]}" finished — {job_snapshot["verified"]} safe, '
                        f'{job_snapshot["risky"]} risky, {job_snapshot["invalid"]} unsafe out of {job_snapshot["total"]} '
                        f'({job_snapshot["reused_results"]} reused, {cache_hit_rate}% cache hit rate).'
                    ),
                    type=NotificationType.success,
                    priority=NotificationPriority.medium,
                    metadata={
                        "job_id": job_id,
                        "file_name": job_snapshot["file_name"],
                        "total": job_snapshot["total"],
                        "verified": job_snapshot["verified"],
                        "risky": job_snapshot["risky"],
                        "invalid": job_snapshot["invalid"],
                        "duplicate_emails_removed": job_snapshot["duplicate_emails_removed"],
                        "reused_results": job_snapshot["reused_results"],
                        "newly_verified": job_snapshot["newly_verified"],
                        "dns_checks_saved": job_snapshot["dns_checks_saved"],
                        "smtp_checks_saved": job_snapshot["smtp_checks_saved"],
                        "cache_hit_rate": cache_hit_rate,
                    },
                )

            try:
                _run_with_retry(_notify_completed, job_snapshot, cache_hit_rate)
            except Exception as exc:
                logger.warning("bulk_job_complete_notification_failed", job_id=job_id, error=str(exc))

    except FileReadError as exc:
        logger.error("bulk_job_file_read_error", job_id=job_id, error=str(exc), exc_info=True)

        def _fail_file_read(db, job_id, exc):
            job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
            if not job:
                return None
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": "FileReadError"}
            db.commit()
            return {"file_name": job.file_name}

        try:
            job_snapshot = _run_with_retry(_fail_file_read, job_id, exc)
            if job_snapshot:
                def _notify_failed(db, job_snapshot, exc):
                    sync_create_notification(
                        db,
                        title="Bulk Upload Failed",
                        message=f'"{job_snapshot["file_name"]}" failed — could not read the uploaded file: {str(exc)}',
                        type=NotificationType.error,
                        priority=NotificationPriority.high,
                        metadata={"job_id": job_id, "file_name": job_snapshot["file_name"], "error": str(exc)},
                    )
                _run_with_retry(_notify_failed, job_snapshot, exc)
        except Exception as inner_exc:
            logger.error("bulk_job_fail_state_write_failed", job_id=job_id, error=str(inner_exc), exc_info=True)

    except Exception as exc:
        logger.error("bulk_job_error", job_id=job_id, error=str(exc), exc_info=True)

        def _fail_generic(db, job_id, exc):
            job = db.execute(select(Job).where(Job.job_id == job_id)).scalar_one_or_none()
            if not job:
                return None
            job.status = JobStatus.failed
            job.error_message = str(exc)
            job.error_details = {"error": str(exc), "type": type(exc).__name__}
            db.commit()
            return {"file_name": job.file_name}

        try:
            job_snapshot = _run_with_retry(_fail_generic, job_id, exc)
            if job_snapshot:
                def _notify_failed(db, job_snapshot, exc):
                    sync_create_notification(
                        db,
                        title="Bulk Upload Failed",
                        message=f'"{job_snapshot["file_name"]}" failed: {str(exc)}',
                        type=NotificationType.error,
                        priority=NotificationPriority.high,
                        metadata={"job_id": job_id, "file_name": job_snapshot["file_name"], "error": str(exc)},
                    )
                _run_with_retry(_notify_failed, job_snapshot, exc)
        except Exception as inner_exc:
            logger.error("bulk_job_fail_state_write_failed", job_id=job_id, error=str(inner_exc), exc_info=True)

        raise