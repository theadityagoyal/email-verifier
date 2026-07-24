"""
Greylisting-aware delayed retry scheduler.

Polls the smtp_retry_queue table every ~30s, picks up pending rows whose
next_retry_at <= now, and re-verifies them via SMTP. Uses the existing
ThreadPoolExecutor + per-thread event loop pattern (same as bulk_processor.py)
so it runs entirely within the FastAPI process — no Celery, no APScheduler,
no extra dependencies.

Flow per retry:
  1) Acquire per-email verification lock (utils/verification_lock.py) —
     prevents concurrent verifications (original job + retry + manual re-check)
  2) Re-run SMTP against stored mx_host first; if connection error, fall back
     to next MX from stored mx_records
  3) If still GREYLISTED and attempt < max_attempts:
        attempt += 1
        next_retry_at = now + min(INITIAL_DELAY * MULTIPLIER^(attempt-1), MAX_DELAY)
        status = 'pending'
  4) Else if final outcome (VALID/INVALID/CATCH_ALL/etc):
        upsert final result to emails table, mark queue row 'completed'
  5) Else (max attempts exhausted):
        upsert final 'greylisted_unconfirmed' to emails table, mark queue row 'failed'

All retries fire for ANY verification source (single API, external API, bulk)
because they are enqueued from verify_email() itself.
"""

import asyncio
import threading
import time
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import AsyncSessionLocal
from models.models import SmtpRetryQueue
from validators.smtp_validator import async_verify_smtp, SmtpOutcome, SmtpResult
from validators.score_calculator import (
    calculate_score,
    determine_status,
    determine_sub_status,
    determine_confidence,
    determine_reason_code,
    TRUSTED_DOMAINS,
)
from validators.disposable_checker import is_disposable
from validators.syntax_validator import is_role_based
from services.domain_service import async_upsert_email, async_upsert_domain
from utils.config import settings
from utils.logging import get_logger
from utils.timezone import utc_now_naive
from utils.verification_lock import email_lock_manager
from utils.executor import get_executor

logger = get_logger(__name__)

# How many rows to pick up per polling cycle (prevents one huge batch from
# starving the executor if many retries come due at once).
BATCH_SIZE = 50

# Polling interval in seconds.
POLL_INTERVAL = 30

# Max concurrent retry verifications (subset of executor workers).
MAX_CONCURRENT_RETRIES = 5

_retry_scheduler_thread: Optional[threading.Thread] = None
_retry_scheduler_stop = threading.Event()
_retry_semaphore: Optional[asyncio.Semaphore] = None


def _get_or_create_semaphore() -> asyncio.Semaphore:
    """Create or reuse the semaphore on the current thread's event loop."""
    global _retry_semaphore
    loop = asyncio.get_event_loop()
    if _retry_semaphore is None:
        _retry_semaphore = asyncio.Semaphore(MAX_CONCURRENT_RETRIES)
    return _retry_semaphore


async def _fetch_due_retries(db: AsyncSession, limit: int = BATCH_SIZE) -> List[SmtpRetryQueue]:
    """Fetch pending retry rows whose next_retry_at <= now, ordered by oldest first."""
    now = utc_now_naive()
    result = await db.execute(
        select(SmtpRetryQueue)
        .where(
            SmtpRetryQueue.status == "pending",
            SmtpRetryQueue.next_retry_at <= now,
        )
        .order_by(SmtpRetryQueue.next_retry_at)
        .limit(limit)
        .with_for_update(skip_locked=True)  # skip rows already picked by another worker
    )
    return list(result.scalars().all())


async def _update_queue_entry(
    db: AsyncSession,
    queue_id: int,
    attempt: int,
    next_retry_at: Optional[datetime],
    status: str,
    last_outcome: Optional[str] = None,
    last_smtp_code: Optional[int] = None,
    last_response: Optional[str] = None,
) -> None:
    """Update a single smtp_retry_queue row."""
    values = {
        "attempt": attempt,
        "status": status,
        "updated_at": utc_now_naive(),
    }
    if next_retry_at is not None:
        values["next_retry_at"] = next_retry_at
    if last_outcome is not None:
        values["last_outcome"] = last_outcome
    if last_smtp_code is not None:
        values["last_smtp_code"] = last_smtp_code
    if last_response is not None:
        values["last_response"] = last_response

    await db.execute(
        update(SmtpRetryQueue)
        .where(SmtpRetryQueue.id == queue_id)
        .values(**values)
    )
    await db.commit()


async def _persist_final_result(
    email: str,
    domain: str,
    smtp_result: SmtpResult,
    mx_records: List[str],
    job_id: Optional[str],
) -> None:
    """
    Upsert the final verification result to the emails table.
    Mirrors the core logic from verify_email() but for a completed retry.
    """
    # Extract signals from the SMTP result
    outcome = smtp_result.outcome
    smtp_valid = outcome in (SmtpOutcome.VALID, SmtpOutcome.CATCH_ALL)
    catch_all = smtp_result.catch_all_outcome

    # These were already validated on the initial check (they're true for retries)
    syntax_valid = True
    domain_exists = True
    mx_found = True
    disposable = is_disposable(domain)
    role = is_role_based(email.split("@")[0])

    # Score using the same logic (no smtp_ambiguous_trusted on retry —
    # retries only happen for non-trusted greylisted initially)
    username = email.split("@")[0]
    score, username_analysis = calculate_score(
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        catch_all=catch_all,
        domain=domain,
        username=username,
        smtp_ambiguous_trusted=False,  # retries don't have "trusted ambiguous" concept
    )

    status = determine_status(
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        catch_all=catch_all,
        score=score,
        domain=domain,
    )

    sub_status = determine_sub_status(
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        catch_all=catch_all,
        score=score,
        domain=domain,
        smtp_outcome=outcome.value,
    )
    confidence = determine_confidence(
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        catch_all=catch_all,
        score=score,
        domain=domain,
        smtp_outcome=outcome.value,
    )
    reason_code = determine_reason_code(
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        catch_all=catch_all,
        score=score,
        domain=domain,
        smtp_outcome=outcome.value,
    )

    from schemas.schemas import EmailVerifyResponse
    response = EmailVerifyResponse(
        email=email,
        domain=domain,
        status=status,
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        role_based=role,
        catch_all=catch_all,
        score=score,
        username_quality=username_analysis.get("verdict"),
        username_flags=username_analysis.get("flags"),
        verified_at=utc_now_naive(),
        mx_records=mx_records,
        dns_checked_at=utc_now_naive(),
        smtp_checked_at=utc_now_naive(),
        record_existed=True,
        dns_reused=False,
        smtp_reused=False,
        dns_check_applicable=True,
        smtp_check_applicable=True,
        smtp_outcome=outcome.value,
        smtp_response_code=smtp_result.smtp_code,
        sub_status=sub_status,
        confidence=confidence,
        reason_code=reason_code,
    )

    # Persist via shared upsert (same path as verify_email)
    async with AsyncSessionLocal() as session:
        await async_upsert_email(session, response, job_id, utc_now_naive())
        if domain:
            await async_upsert_domain(session, domain, mx_records, utc_now_naive())
        await session.commit()


async def _retry_one(queue_entry: SmtpRetryQueue) -> None:
    """
    Process a single retry queue entry.
    Runs under semaphore to limit concurrency.
    """
    semaphore = _get_or_create_semaphore()
    async with semaphore:
        email = queue_entry.email
        mx_host = queue_entry.mx_host
        mx_records = queue_entry.mx_records or [mx_host]
        attempt = queue_entry.attempt
        max_attempts = queue_entry.max_attempts
        job_id = queue_entry.job_id

        logger.debug("greylist_retry_start", email=email, attempt=attempt, max=max_attempts)

        # Acquire per-email lock to avoid concurrent verifications
        lock_entry = None
        try:
            if settings.RESULT_REUSE_ENABLED:
                lock_entry = await email_lock_manager.acquire(email)

            # Try the stored MX host first, then fall back to the rest
            smtp_result: SmtpResult = await async_verify_smtp(
                email=email,
                mx_records=[mx_host] + [h for h in mx_records if h != mx_host],
                timeout=settings.SMTP_TIMEOUT,
            )

            logger.debug("greylist_retry_smtp_result", email=email,
                         outcome=smtp_result.outcome.value, code=smtp_result.smtp_code)

            # Determine next action based on outcome
            if smtp_result.outcome == SmtpOutcome.GREYLISTED:
                if attempt < max_attempts:
                    # Schedule another retry with exponential backoff
                    initial_delay = settings.SMTP_RETRY_INITIAL_DELAY
                    multiplier = settings.SMTP_RETRY_MULTIPLIER
                    max_delay = settings.SMTP_RETRY_MAX_DELAY
                    delay = min(initial_delay * (multiplier ** attempt), max_delay)
                    next_retry_at = utc_now_naive() + timedelta(seconds=delay)
                    new_attempt = attempt + 1

                    async with AsyncSessionLocal() as db:
                        await _update_queue_entry(
                            db=db,
                            queue_id=queue_entry.id,
                            attempt=new_attempt,
                            next_retry_at=next_retry_at,
                            status="pending",
                            last_outcome=smtp_result.outcome.value,
                            last_smtp_code=smtp_result.smtp_code,
                            last_response=smtp_result.raw_response,
                        )
                    logger.info("greylist_retry_rescheduled",
                                email=email, attempt=new_attempt, next_retry_at=next_retry_at.isoformat())
                else:
                    # Max attempts exhausted — persist final 'greylisted_unconfirmed'
                    async with AsyncSessionLocal() as db:
                        await _persist_final_result(
                            email=email,
                            domain=queue_entry.domain,
                            smtp_result=smtp_result,
                            mx_records=mx_records,
                            job_id=job_id,
                        )
                        await _update_queue_entry(
                            db=db,
                            queue_id=queue_entry.id,
                            attempt=attempt,
                            next_retry_at=None,
                            status="failed",
                            last_outcome=smtp_result.outcome.value,
                            last_smtp_code=smtp_result.smtp_code,
                            last_response=smtp_result.raw_response,
                        )
                    logger.info("greylist_retry_max_attempts_reached",
                                email=email, attempts=attempt)
            else:
                # Final outcome (VALID, INVALID, CATCH_ALL, TIMEOUT, BLOCKED, etc.)
                async with AsyncSessionLocal() as db:
                    await _persist_final_result(
                        email=email,
                        domain=queue_entry.domain,
                        smtp_result=smtp_result,
                        mx_records=mx_records,
                        job_id=job_id,
                    )
                    await _update_queue_entry(
                        db=db,
                        queue_id=queue_entry.id,
                        attempt=attempt,
                        next_retry_at=None,
                        status="completed",
                        last_outcome=smtp_result.outcome.value,
                        last_smtp_code=smtp_result.smtp_code,
                        last_response=smtp_result.raw_response,
                    )
                logger.info("greylist_retry_completed",
                            email=email, outcome=smtp_result.outcome.value, attempt=attempt)

        except Exception as exc:
            logger.error("greylist_retry_failed", email=email, error=str(exc), exc_info=True)
            # On unexpected error, don't schedule another retry — mark failed
            # but don't persist a result to emails (we don't know what happened)
            async with AsyncSessionLocal() as db:
                await _update_queue_entry(
                    db=db,
                    queue_id=queue_entry.id,
                    attempt=attempt,
                    next_retry_at=None,
                    status="failed",
                    last_outcome="ERROR",
                    last_response=str(exc),
                )
        finally:
            if settings.RESULT_REUSE_ENABLED and lock_entry is not None:
                await email_lock_manager.release(email, lock_entry)


async def _poll_loop() -> None:
    """Main polling loop — runs in a background thread."""
    logger.info("greylist_retry_scheduler_started", poll_interval=POLL_INTERVAL, batch_size=BATCH_SIZE)

    while not _retry_scheduler_stop.is_set():
        cycle_start = time.time()

        try:
            # Fetch due retries
            async with AsyncSessionLocal() as db:
                due_retries = await _fetch_due_retries(db, limit=BATCH_SIZE)

            if due_retries:
                logger.info("greylist_retry_batch_picked", count=len(due_retries))
                # Submit all to executor (they run async on thread's event loop)
                executor = get_executor()
                thread_local = threading.local()  # ensure each gets its own loop context

                # Fire and forget — _retry_one handles its own DB session
                futures = [
                    executor.submit(
                        lambda q=entry: _run_on_thread_loop(_retry_one(q))
                    )
                    for entry in due_retries
                ]
                # Don't wait — let them complete in background
                # (waiting would block the poll loop)
        except Exception as exc:
            logger.error("greylist_retry_poll_error", error=str(exc), exc_info=True)

        # Sleep until next poll, but respect stop signal
        elapsed = time.time() - cycle_start
        sleep_time = max(0, POLL_INTERVAL - elapsed)
        for _ in range(int(sleep_time * 10)):  # check stop every 0.1s
            if _retry_scheduler_stop.is_set():
                break
            time.sleep(0.1)

    logger.info("greylist_retry_scheduler_stopped")


def _run_on_thread_loop(coro):
    """Run an async coroutine on this thread's event loop (created lazily)."""
    # Each thread has its own event loop (reused via bulk_processor pattern)
    loop = getattr(threading.current_thread(), "_retry_loop", None)
    if loop is None or loop.is_closed():
        loop = asyncio.new_event_loop()
        threading.current_thread()._retry_loop = loop
    return loop.run_until_complete(coro)


def start_retry_scheduler() -> None:
    """Start the background retry scheduler thread."""
    global _retry_scheduler_thread, _retry_scheduler_stop
    if not settings.SMTP_RETRY_ENABLED:
        logger.info("greylist_retry_scheduler_disabled")
        return

    if _retry_scheduler_thread is not None and _retry_scheduler_thread.is_alive():
        logger.warning("greylist_retry_scheduler_already_running")
        return

    _retry_scheduler_stop.clear()
    _retry_scheduler_thread = threading.Thread(target=_run_scheduler_thread, name="GreylistRetryScheduler", daemon=True)
    _retry_scheduler_thread.start()
    logger.info("greylist_retry_scheduler_thread_started")


def stop_retry_scheduler(wait: bool = True) -> None:
    """Stop the background retry scheduler thread."""
    global _retry_scheduler_thread, _retry_scheduler_stop
    _retry_scheduler_stop.set()
    if _retry_scheduler_thread is not None:
        _retry_scheduler_thread.join(timeout=5 if wait else 0)
        _retry_scheduler_thread = None
    logger.info("greylist_retry_scheduler_stopped")


def _run_scheduler_thread() -> None:
    """Thread entry point — creates event loop and runs _poll_loop."""
    loop = asyncio.new_event_loop()
    threading.current_thread()._retry_loop = loop
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_poll_loop())
    finally:
        loop.close()