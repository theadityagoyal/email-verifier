"""
Bulk-job watchdog — reconciles jobs orphaned by a server crash/restart.

bulk_processor.py's _update_job_counter() now flips `Job.status` to
`completed` as soon as the last email is counted, which closes most of the
"stuck at Processing forever" window. But if the process is killed/restarted
WHILE a job is still mid-flight — a deploy, an OOM, the thread-explosion
resource pressure documented in bulk_processor.py, anything — the in-memory
ThreadPoolExecutor and its futures are gone. Nothing else in the app will
ever revisit that job's row again; it just sits at status='processing'
indefinitely with a frozen progress bar, and the frontend's download/results
UI (gated on status === 'completed') never unlocks.

This watchdog runs on its own background thread (same plain
thread + polling-loop pattern as tasks/retry_scheduler.py — no
Celery/APScheduler) and periodically looks for exactly that situation.

Staleness detection: the Job model has no `updated_at` column, so instead of
comparing against a DB timestamp, this watchdog keeps an in-memory map of
each processing job's last-seen `processed` count. If a job is still
status='processing' and its `processed` count hasn't moved across two
consecutive sweeps spanning STALE_THRESHOLD_SECONDS, it's treated as
orphaned:

  - if it actually finished (processed >= total) but the final status flip
    never landed → mark it completed now (best-effort, matches what
    process_bulk_job_sync would have done)
  - otherwise → mark it failed with a clear, honest error message, so the
    user sees a real "failed" state (and can retry) instead of an
    indefinitely spinning progress bar

Note: this tracking is per-process/in-memory, so in a multi-instance
deployment each instance independently notices a stall after its own
STALE_THRESHOLD_SECONDS window. That's fine here — reconciliation is
idempotent (a plain UPDATE ... WHERE status='processing'), so it's harmless
if more than one instance ends up racing to reconcile the same row.
"""
import threading
import time

from sqlalchemy import select, update

from models.database import SyncSessionLocal
from models.models import Job, JobStatus, NotificationType, NotificationPriority
from services.notification_service import sync_create_notification
from utils.logging import get_logger
from utils.timezone import utc_now_naive

logger = get_logger(__name__)

# How often the watchdog sweeps for orphaned jobs.
POLL_INTERVAL_SECONDS = 60

# A processing job's `processed` counter not moving across sweeps for at
# least this long is treated as orphaned. Comfortably above the time even a
# large, healthy bulk job should go without a single email completing.
STALE_THRESHOLD_SECONDS = 5 * 60

_watchdog_thread: threading.Thread | None = None
_watchdog_stop = threading.Event()

# job_id -> (processed_count, first_seen_at_this_count)
_progress_watermarks: dict[str, tuple[int, float]] = {}


def _reconcile_once() -> None:
    db = SyncSessionLocal()
    now_ts = time.monotonic()
    try:
        processing_jobs = db.execute(
            select(Job).where(Job.status == JobStatus.processing)
        ).scalars().all()

        seen_job_ids = set()

        for job in processing_jobs:
            seen_job_ids.add(job.job_id)
            watermark = _progress_watermarks.get(job.job_id)

            if watermark is None or watermark[0] != job.processed:
                # First time we've seen this job, or it made progress since
                # the last sweep — reset the clock.
                _progress_watermarks[job.job_id] = (job.processed, now_ts)
                continue

            stalled_for = now_ts - watermark[1]
            if stalled_for < STALE_THRESHOLD_SECONDS:
                continue

            # No progress for STALE_THRESHOLD_SECONDS while still marked
            # "processing" → orphaned by a crash/restart.
            _progress_watermarks.pop(job.job_id, None)

            if job.total > 0 and job.processed >= job.total:
                db.execute(
                    update(Job)
                    .where(Job.job_id == job.job_id, Job.status == JobStatus.processing)
                    .values(
                        status=JobStatus.completed,
                        current_stage='completed',
                        progress_percent=100,
                        completed_at=job.completed_at or utc_now_naive(),
                    )
                )
                db.commit()
                logger.warning(
                    "orphaned_job_reconciled_completed",
                    job_id=job.job_id,
                    processed=job.processed,
                    total=job.total,
                )
                sync_create_notification(
                    db,
                    title="Bulk Upload Completed",
                    message=(
                        f'"{job.file_name}" finished processing but the job status '
                        f'was not updated in time (likely a server restart). '
                        f'Results are available now.'
                    ),
                    type=NotificationType.success,
                    priority=NotificationPriority.medium,
                    metadata={"job_id": job.job_id, "file_name": job.file_name, "reconciled": True},
                )
            else:
                db.execute(
                    update(Job)
                    .where(Job.job_id == job.job_id, Job.status == JobStatus.processing)
                    .values(
                        status=JobStatus.failed,
                        error_message=(
                            f"Interrupted after processing {job.processed}/{job.total} emails "
                            f"(server restarted or crashed mid-job). Please retry the upload."
                        ),
                        error_details={"type": "OrphanedJob", "processed": job.processed, "total": job.total},
                        completed_at=utc_now_naive(),
                    )
                )
                db.commit()
                logger.warning(
                    "orphaned_job_reconciled_failed",
                    job_id=job.job_id,
                    processed=job.processed,
                    total=job.total,
                )
                sync_create_notification(
                    db,
                    title="Bulk Upload Failed",
                    message=(
                        f'"{job.file_name}" was interrupted after processing '
                        f'{job.processed}/{job.total} emails and did not resume. '
                        f'Please retry the upload.'
                    ),
                    type=NotificationType.error,
                    priority=NotificationPriority.high,
                    metadata={"job_id": job.job_id, "file_name": job.file_name, "reconciled": True},
                )

        # Forget watermarks for jobs that are no longer 'processing' (they
        # finished, were cancelled, or were reconciled above).
        for stale_job_id in list(_progress_watermarks.keys()):
            if stale_job_id not in seen_job_ids:
                _progress_watermarks.pop(stale_job_id, None)

    except Exception as exc:
        db.rollback()
        logger.error("job_watchdog_sweep_failed", error=str(exc), exc_info=True)
    finally:
        db.close()


def _run_watchdog_thread() -> None:
    logger.info("job_watchdog_started", poll_interval=POLL_INTERVAL_SECONDS, stale_threshold=STALE_THRESHOLD_SECONDS)
    while not _watchdog_stop.is_set():
        _reconcile_once()
        for _ in range(POLL_INTERVAL_SECONDS * 10):
            if _watchdog_stop.is_set():
                break
            time.sleep(0.1)
    logger.info("job_watchdog_stopped")


def start_job_watchdog() -> None:
    global _watchdog_thread
    if _watchdog_thread is not None and _watchdog_thread.is_alive():
        logger.warning("job_watchdog_already_running")
        return
    _watchdog_stop.clear()
    _progress_watermarks.clear()
    _watchdog_thread = threading.Thread(target=_run_watchdog_thread, name="JobWatchdog", daemon=True)
    _watchdog_thread.start()


def stop_job_watchdog(wait: bool = True) -> None:
    global _watchdog_thread
    _watchdog_stop.set()
    if _watchdog_thread is not None:
        _watchdog_thread.join(timeout=5 if wait else 0)
        _watchdog_thread = None
