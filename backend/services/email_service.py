import json
from datetime import datetime, timedelta
from typing import Optional, List

from sqlalchemy import select

from validators.syntax_validator import validate_syntax, is_role_based
from validators.dns_validator import async_check_domain_exists, async_get_mx_records, async_get_spf_record, async_get_dmarc_record
from validators.smtp_validator import async_verify_smtp, SmtpResult, SmtpOutcome
from validators.disposable_checker import is_disposable
from validators.score_calculator import calculate_score, determine_status, determine_sub_status, determine_confidence, determine_reason_code, TRUSTED_DOMAINS
from schemas.schemas import EmailVerifyResponse
from models.database import AsyncSessionLocal
from models.models import Email as EmailModel, Domain as DomainModel, SmtpRetryQueue
from services.domain_service import async_upsert_email, async_upsert_domain
from utils.config import settings
from utils.logging import get_logger
from utils.timezone import utc_now_naive

SMTP_TIMEOUT_TRUSTED = settings.SMTP_TIMEOUT_TRUSTED
from utils.verification_lock import email_lock_manager

logger = get_logger(__name__)


def _is_fresh(checked_at: Optional[datetime], ttl_days: int, now: datetime) -> bool:
    """
    Pure helper — is a previously-recorded check still inside its TTL window?
    Kept side-effect-free and separate so it's trivially unit-testable
    (see tests/test_verification_reuse.py) without needing DB/DNS/SMTP mocks.
    """
    if not checked_at:
        return False
    return (now - checked_at) < timedelta(days=ttl_days)


async def _fetch_existing_email(email: str) -> Optional[EmailModel]:
    """Short-lived read of the current DB row for this email, if any."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(EmailModel).where(EmailModel.email == email))
        return result.scalar_one_or_none()


async def _fetch_domain_mx_records(domain: str) -> List[str]:
    """
    Read cached MX hostnames for a domain from the `domains` table
    (this is the ONLY place MX hostnames are cached — the `emails` table
    only stores the domain_exists/mx_found booleans, not the raw hostname list).
    Used when DNS is being reused (fresh) but SMTP still needs a real connection
    — we need real MX hostnames to connect to, even though we skipped the DNS
    lookup itself.
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DomainModel.mx_records).where(DomainModel.domain == domain)
        )
        row = result.scalar_one_or_none()
        return row or []


async def _persist_result(response: EmailVerifyResponse, job_id: Optional[str], now: datetime) -> None:
    """
    Best-effort persistence of the final verification result (Email row +
    Domain aggregate row). Runs inside the same per-email lock as the
    verification decision itself, so the DB write that "unlocks" reuse for
    the next caller happens before the lock is released — this is what
    actually closes the race window for concurrent duplicate verification,
    not just the decision-making step.

    Intentionally best-effort (log + continue, don't raise): this helper is
    now shared by three different call sites (internal dashboard verify,
    external API verify, bulk worker) with three different error-handling
    conventions. A hard failure here must never be allowed to make an
    otherwise-successful verification look like it failed to the caller.
    """
    async with AsyncSessionLocal() as session:
        try:
            await async_upsert_email(session, response, job_id, now)
            if response.domain:
                await async_upsert_domain(session, response.domain, response.mx_records, now)
            await session.commit()
        except Exception as exc:
            await session.rollback()
            logger.error("verification_persist_failed", email=response.email, error=str(exc), exc_info=True)


async def _enqueue_greylist_retry(
    email: str,
    mx_records: List[str],
    attempt: int,
    job_id: Optional[str] = None,
) -> bool:
    """
    Insert a row into smtp_retry_queue for a greylisted email.

    Called only when:
      - SMTP_RETRY_ENABLED is True
      - SMTP outcome is GREYLISTED
      - Not a trusted-domain ambiguous outcome (those don't retry)

    Args:
        email: The email address that was greylisted
        mx_records: List of MX hostnames (we'll use the first one for retry)
        attempt: Attempt number (1 = first retry after initial check)
        job_id: Optional original job ID for traceability

    Returns:
        True if enqueued, False if skipped (e.g., no MX records)
    """
    if not mx_records:
        logger.warning("greylist_retry_skipped_no_mx", email=email)
        return False

    # Use the first MX record for retry (same as normal verification)
    mx_host = mx_records[0]
    domain = email.split("@")[1].lower()

    # Calculate next retry time with exponential backoff
    initial_delay = settings.SMTP_RETRY_INITIAL_DELAY
    multiplier = settings.SMTP_RETRY_MULTIPLIER
    max_delay = settings.SMTP_RETRY_MAX_DELAY
    delay = min(initial_delay * (multiplier ** (attempt - 1)), max_delay)

    now = utc_now_naive()
    next_retry_at = now + timedelta(seconds=delay)

    async with AsyncSessionLocal() as session:
        try:
            queue_entry = SmtpRetryQueue(
                email=email,
                domain=domain,
                mx_host=mx_host,
                mx_records=mx_records,
                attempt=attempt,
                max_attempts=settings.SMTP_RETRY_MAX_ATTEMPTS,
                next_retry_at=next_retry_at,
                last_outcome=SmtpOutcome.GREYLISTED.value,
                job_id=job_id,
                status="pending",
            )
            session.add(queue_entry)
            await session.commit()
            return True
        except Exception as exc:
            await session.rollback()
            logger.error("greylist_enqueue_failed", email=email, error=str(exc), exc_info=True)
            return False


async def verify_email(email: str, job_id: Optional[str] = None, force_fresh: bool = False) -> EmailVerifyResponse:
    """
    Full async email verification pipeline with smart result reuse:
      syntax → [lock] → existing-record lookup → domain DNS/MX (reused or
      fresh) → SMTP/catch-all (reused or fresh) → disposable/role checks →
      score → persist → [unlock]

    Syntax and disposable checks are pure/cheap (no I/O) and are ALWAYS
    recomputed. DNS+MX and SMTP+catch-all are reused from the existing DB
    record when a fresh-enough previous check exists (see
    utils/config.py: RESULT_REUSE_ENABLED, DNS_MX_TTL_DAYS, SMTP_TTL_DAYS).

    Args:
        email: The email address to verify
        job_id: Optional bulk job this verification belongs to (stamped onto
            the persisted Email row, same as before)
        force_fresh: If True, bypass TTL cache and force fresh DNS/SMTP checks

    Returns:
        EmailVerifyResponse: Verification results, including reuse metadata
        (record_existed, dns_reused, smtp_reused, dns_check_applicable,
        smtp_check_applicable) used by callers for job-level metrics.
    """
    logger.info("verify_start", email=email, force_fresh=force_fresh)

    try:
        # 1. Syntax validation (always fresh, no I/O, no lock needed)
        syntactic_valid, normalized, domain = validate_syntax(email)
        logger.info("syntax_checked", email=email, syntax_valid=syntactic_valid, domain=domain)
        if not syntactic_valid:
            response = _build_invalid_response(email=email, syntax_valid=False)
            await _persist_result(response, job_id, utc_now_naive())
            return response

        email = normalized  # use normalised form from here on
        reuse_enabled = settings.RESULT_REUSE_ENABLED and not force_fresh

        lock_entry = None
        if reuse_enabled:
            lock_entry = await email_lock_manager.acquire(email)

        try:
            now = utc_now_naive()

            # 2. Role-based check (cheap, no I/O, always fresh)
            role = is_role_based(email)
            logger.info("role_checked", email=email, role=role)

            # 3. Disposable check (no I/O, always fresh)
            disposable = is_disposable(domain)
            logger.info("disposable_checked", email=email, disposable=disposable)

            # 4. Look up any existing record for reuse decisions
            existing: Optional[EmailModel] = None
            if reuse_enabled:
                existing = await _fetch_existing_email(email)

            record_existed = existing is not None
            is_trusted = domain.lower() in TRUSTED_DOMAINS

            dns_mx_ttl_days = settings.DNS_MX_TTL_DAYS
            smtp_ttl_days = settings.SMTP_TTL_DAYS

            dns_fresh = (
                reuse_enabled and existing is not None
                and _is_fresh(existing.dns_checked_at, dns_mx_ttl_days, now)
            )
            smtp_fresh = (
                reuse_enabled and existing is not None
                and _is_fresh(existing.smtp_checked_at, smtp_ttl_days, now)
            )

            # dns_check_applicable: would we EVER need a real DNS lookup for
            # this email (i.e. it's not on the trusted fast path, which
            # never touches DNS regardless of reuse settings)?
            dns_check_applicable = True
            dns_reused = False
            dns_checked_at = existing.dns_checked_at if existing else None
            persist_mx_records: Optional[List[str]] = None

            if dns_fresh:
                domain_exists = bool(existing.domain_exists)
                mx_found = bool(existing.mx_found)
                mx_records_for_smtp = await _fetch_domain_mx_records(domain) if mx_found else []
                dns_reused = True
                logger.info("dns_reused", email=email, domain=domain,
                            checked_at=str(existing.dns_checked_at))
                # dns_checked_at intentionally left as the existing value —
                # we did not recheck, so its "freshness clock" must not reset.
                # DNS was fresh (reused) - SPF/DMARC not checked in this run, use existing or None
                spf_valid = bool(existing.spf_valid) if existing and existing.spf_valid is not None else None
                dmarc_valid = bool(existing.dmarc_valid) if existing and existing.dmarc_valid is not None else None
            else:
                domain_exists = await async_check_domain_exists(domain)
                logger.info("domain_checked", email=email, domain_exists=domain_exists)
                mx_records_for_smtp = await async_get_mx_records(domain) if domain_exists else []
                mx_found = len(mx_records_for_smtp) > 0
                persist_mx_records = mx_records_for_smtp  # real DNS result, safe to cache on Domain
                dns_checked_at = now
                logger.info("mx_checked", email=email, mx_records=mx_records_for_smtp, mx_found=mx_found)

                # Phase 5: SPF/DMARC presence lookups (cheap, same DNS batch)
                spf_record = await async_get_spf_record(domain) if domain_exists else None
                dmarc_record = await async_get_dmarc_record(domain) if domain_exists else None
                spf_valid = spf_record is not None
                dmarc_valid = dmarc_record is not None
                logger.debug("spf_dmarc_checked", email=email, spf_valid=spf_valid, dmarc_valid=dmarc_valid)

            # 6. SMTP verification
            # Trusted domains still go through real SMTP but with a faster timeout.
            # Other domains follow the original logic.
            smtp_check_applicable = (not disposable) and mx_found
            smtp_reused = False
            smtp_checked_at = existing.smtp_checked_at if existing else None
            smtp_outcome: Optional[str] = None
            smtp_response_code: Optional[int] = None
            smtp_ambiguous_trusted = False  # Phase 3: true if trusted domain + ambiguous SMTP outcome

            if not smtp_check_applicable:
                smtp_valid = False
                catch_all = False
                # Not applicable (disposable / no MX) — leave
                # smtp_checked_at untouched.
            elif smtp_fresh:
                smtp_valid = bool(existing.smtp_valid)
                catch_all = bool(existing.catch_all)
                smtp_outcome = existing.smtp_outcome
                smtp_response_code = existing.smtp_response_code
                smtp_reused = True
                logger.info("smtp_reused", email=email, checked_at=str(existing.smtp_checked_at))
            else:
                # Use shorter timeout for trusted domains
                smtp_timeout = settings.SMTP_TIMEOUT_TRUSTED if is_trusted else settings.SMTP_TIMEOUT
                smtp_result: SmtpResult = await async_verify_smtp(email, mx_records_for_smtp, timeout=smtp_timeout)

                smtp_outcome = smtp_result.outcome.value
                smtp_response_code = smtp_result.smtp_code
                smtp_checked_at = now

                # Phase 3: Handle ambiguous outcomes for trusted domains
                # (TIMEOUT, GREYLISTED, TEMP_FAILURE, BLOCKED) — treat as "ambiguous" not "invalid"
                ambiguous_outcomes = {SmtpOutcome.TIMEOUT, SmtpOutcome.GREYLISTED, SmtpOutcome.TEMP_FAILURE, SmtpOutcome.BLOCKED}

                if is_trusted and smtp_result.outcome in ambiguous_outcomes:
                    # Ambiguous result for trusted domain — don't penalize, treat as couldn't verify
                    smtp_valid = True  # Keep base_score path available for scoring
                    catch_all = False
                    smtp_ambiguous_trusted = True
                    logger.info("smtp_ambiguous_trusted", email=email, outcome=smtp_outcome, code=smtp_response_code)
                else:
                    # Normal logic: VALID or CATCH_ALL = valid
                    smtp_valid = smtp_result.outcome in (SmtpOutcome.VALID, SmtpOutcome.CATCH_ALL)
                    catch_all = smtp_result.catch_all_outcome

                logger.info("smtp_checked", email=email, smtp_valid=smtp_valid, catch_all=catch_all,
                            smtp_outcome=smtp_outcome, smtp_code=smtp_response_code, ambiguous=smtp_ambiguous_trusted)

            # Phase 4: Enqueue for delayed retry if greylisted (and not a trusted-domain ambiguous)
            greylist_enqueued = False
            if settings.SMTP_RETRY_ENABLED and smtp_outcome == SmtpOutcome.GREYLISTED and not smtp_ambiguous_trusted:
                greylist_enqueued = await _enqueue_greylist_retry(
                    email=email,
                    mx_records=mx_records_for_smtp,
                    attempt=1,
                    job_id=job_id,
                )
                if greylist_enqueued:
                    logger.info("greylist_retry_enqueued", email=email, attempt=1)

            # 7. Score & status determination
            username = email.split("@")[0]
            score, username_analysis = calculate_score(
                syntax_valid=syntactic_valid,
                domain_exists=domain_exists,
                mx_found=mx_found,
                smtp_valid=smtp_valid,
                disposable=disposable,
                catch_all=catch_all,
                domain=domain or "",
                username=username,
                smtp_ambiguous_trusted=smtp_ambiguous_trusted,
                spf_valid=spf_valid,
                dmarc_valid=dmarc_valid,
            )

            status = determine_status(
                syntax_valid=syntactic_valid,
                domain_exists=domain_exists,
                mx_found=mx_found,
                smtp_valid=smtp_valid,
                disposable=disposable,
                catch_all=catch_all,
                score=score,
                domain=domain or "",
            )

            # Phase 2: Sub-status, confidence, reason code
            sub_status = determine_sub_status(
                syntax_valid=syntactic_valid,
                domain_exists=domain_exists,
                mx_found=mx_found,
                smtp_valid=smtp_valid,
                disposable=disposable,
                catch_all=catch_all,
                score=score,
                domain=domain or "",
                smtp_outcome=smtp_outcome,
            )
            confidence = determine_confidence(
                syntax_valid=syntactic_valid,
                domain_exists=domain_exists,
                mx_found=mx_found,
                smtp_valid=smtp_valid,
                disposable=disposable,
                catch_all=catch_all,
                score=score,
                domain=domain or "",
                smtp_outcome=smtp_outcome,
            )
            reason_code = determine_reason_code(
                syntax_valid=syntactic_valid,
                domain_exists=domain_exists,
                mx_found=mx_found,
                smtp_valid=smtp_valid,
                disposable=disposable,
                catch_all=catch_all,
                score=score,
                domain=domain or "",
                smtp_outcome=smtp_outcome,
            )

            logger.info("verify_done", email=email, status=status, score=score,
                        dns_reused=dns_reused, smtp_reused=smtp_reused, record_existed=record_existed,
                        sub_status=sub_status, confidence=confidence, reason_code=reason_code)

            response = _build_response(
                email=email,
                domain=domain,
                syntax_valid=syntactic_valid,
                domain_exists=domain_exists,
                mx_found=mx_found,
                smtp_valid=smtp_valid,
                disposable=disposable,
                role_based=role,
                catch_all=catch_all,
                score=score,
                status=status,
                username_quality=username_analysis.get("verdict"),
                username_flags=username_analysis.get("flags"),
                mx_records=persist_mx_records,
                dns_checked_at=dns_checked_at,
                smtp_checked_at=smtp_checked_at,
                record_existed=record_existed,
                dns_reused=dns_reused,
                smtp_reused=smtp_reused,
                dns_check_applicable=dns_check_applicable,
                smtp_check_applicable=smtp_check_applicable,
                smtp_outcome=smtp_outcome,
                smtp_response_code=smtp_response_code,
                sub_status=sub_status,
                confidence=confidence,
                reason_code=reason_code,
                spf_valid=spf_valid,
                dmarc_valid=dmarc_valid,
            )

            # Persist BEFORE releasing the lock — this is what actually
            # prevents a duplicate concurrent verification: the next
            # waiter (blocked on email_lock_manager.acquire below) won't
            # see this row as "existing" until it's actually committed.
            await _persist_result(response, job_id, now)

            return response

        finally:
            if reuse_enabled and lock_entry is not None:
                await email_lock_manager.release(email, lock_entry)

    except Exception as e:
        logger.error(f"Email verification failed for {email}: {str(e)}", exc_info=True)
        # Return a safe fallback response indicating verification error
        response = _build_error_response(email=email)
        await _persist_result(response, job_id, utc_now_naive())
        return response


def _build_response(
    email: str,
    domain: str | None,
    syntax_valid: bool = False,
    domain_exists: bool = False,
    mx_found: bool = False,
    smtp_valid: bool = False,
    disposable: bool = False,
    role_based: bool = False,
    catch_all: bool = False,
    score: int = 0,
    status=None,
    username_quality: str | None = None,
    username_flags: Optional[List[str]] = None,
    mx_records: Optional[List[str]] = None,
    dns_checked_at: Optional[datetime] = None,
    smtp_checked_at: Optional[datetime] = None,
    record_existed: bool = False,
    dns_reused: bool = False,
    smtp_reused: bool = False,
    dns_check_applicable: bool = True,
    smtp_check_applicable: bool = True,
    smtp_outcome: Optional[str] = None,
    smtp_response_code: Optional[int] = None,
    sub_status: Optional[str] = None,
    confidence: Optional[str] = None,
    reason_code: Optional[str] = None,
    spf_valid: Optional[bool] = None,
    dmarc_valid: Optional[bool] = None,
) -> EmailVerifyResponse:
    """Build a successful verification response."""
    from models.models import EmailStatus
    if status is None:
        status = EmailStatus.invalid

    # Only set verified_at for non-processing statuses
    verified_at = utc_now_naive() if status != EmailStatus.processing else None

    return EmailVerifyResponse(
        email=email,
        domain=domain,
        status=status,
        syntax_valid=syntax_valid,
        domain_exists=domain_exists,
        mx_found=mx_found,
        smtp_valid=smtp_valid,
        disposable=disposable,
        role_based=role_based,
        catch_all=catch_all,
        score=score,
        username_quality=username_quality,
        username_flags=username_flags,
        verified_at=verified_at,
        mx_records=mx_records,
        dns_checked_at=dns_checked_at,
        smtp_checked_at=smtp_checked_at,
        record_existed=record_existed,
        dns_reused=dns_reused,
        smtp_reused=smtp_reused,
        dns_check_applicable=dns_check_applicable,
        smtp_check_applicable=smtp_check_applicable,
        smtp_outcome=smtp_outcome,
        smtp_response_code=smtp_response_code,
        sub_status=sub_status,
        confidence=confidence,
        reason_code=reason_code,
        spf_valid=spf_valid,
        dmarc_valid=dmarc_valid,
    )


def _build_invalid_response(
    email: str,
    syntax_valid: bool = False,
) -> EmailVerifyResponse:
    """Build a response for invalid emails (syntax or other early failures)."""
    from models.models import EmailStatus
    return EmailVerifyResponse(
        email=email,
        domain=None,
        status=EmailStatus.invalid,
        syntax_valid=syntax_valid,
        domain_exists=False,
        mx_found=False,
        smtp_valid=False,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=0,
        username_quality=None,
        username_flags=None,
        verified_at=None,
        mx_records=None,
        dns_checked_at=None,
        smtp_checked_at=None,
        record_existed=False,
        dns_reused=False,
        smtp_reused=False,
        dns_check_applicable=False,
        smtp_check_applicable=False,
        smtp_outcome=None,
        smtp_response_code=None,
        sub_status=None,
        confidence=None,
        reason_code=None,
        spf_valid=None,
        dmarc_valid=None,
    )


def _build_error_response(
    email: str,
) -> EmailVerifyResponse:
    """Build a response for verification errors (exceptions during processing)."""
    from models.models import EmailStatus
    return EmailVerifyResponse(
        email=email,
        domain=None,
        status=EmailStatus.invalid,  # or could use a special error status if available
        syntax_valid=False,
        domain_exists=False,
        mx_found=False,
        smtp_valid=False,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=0,
        username_quality=None,
        username_flags=None,
        verified_at=None,
        mx_records=None,
        dns_checked_at=None,
        smtp_checked_at=None,
        record_existed=False,
        dns_reused=False,
        smtp_reused=False,
        dns_check_applicable=False,
        smtp_check_applicable=False,
        smtp_outcome=None,
        smtp_response_code=None,
        sub_status=None,
        confidence=None,
        reason_code=None,
        spf_valid=None,
        dmarc_valid=None,
    )
