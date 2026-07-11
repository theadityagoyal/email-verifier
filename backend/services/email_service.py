from datetime import datetime, timezone
from typing import Optional, List

from validators.syntax_validator import validate_syntax, is_role_based
from validators.dns_validator import async_check_domain_exists, async_get_mx_records
from validators.smtp_validator import async_verify_smtp
from validators.disposable_checker import is_disposable
from validators.score_calculator import calculate_score, determine_status, TRUSTED_DOMAINS
from schemas.schemas import EmailVerifyResponse
from utils.logging import get_logger

logger = get_logger(__name__)


async def verify_email(email: str) -> EmailVerifyResponse:
    """
    Full async email verification pipeline:
      syntax → domain DNS → MX lookup → SMTP → disposable/role checks → score

    Args:
        email: The email address to verify

    Returns:
        EmailVerifyResponse: Verification results

    Raises:
        Exception: Propagates exceptions from underlying validators for upstream handling
    """
    logger.info("verify_start", email=email)

    try:
        # 1. Syntax validation
        syntactic_valid, normalized, domain = validate_syntax(email)
        logger.info("syntax_checked", email=email, syntax_valid=syntactic_valid, domain=domain)
        if not syntactic_valid:
            return _build_invalid_response(
                email=email,
                syntax_valid=False,
            )

        email = normalized     # use normalised form from here on

        # 2. Role-based check (cheap, no I/O)
        role = is_role_based(email)
        logger.info("role_checked", email=email, role=role)

        # 3. Disposable check (no I/O)
        disposable = is_disposable(domain)
        logger.info("disposable_checked", email=email, disposable=disposable)

        # 4 & 5. Trusted domain = DNS skip, direct verified
        # persist_mx_records tracks what should be written to Domain.mx_records:
        # for the trusted-domain fast path we never actually queried DNS, so we
        # deliberately leave it as None (meaning "don't touch the stored value")
        # instead of writing the synthetic "mx.<domain>" placeholder used only
        # for the (skipped) SMTP probe below.
        persist_mx_records: Optional[List[str]] = None

        if domain.lower() in TRUSTED_DOMAINS:
            domain_exists = True
            mx_found = True
            mx_records = [f"mx.{domain}"]
            logger.info("trusted_domain_skip", email=email, domain=domain)
        else:
            # Domain DNS existence
            domain_exists = await async_check_domain_exists(domain)
            logger.info("domain_checked", email=email, domain_exists=domain_exists)

            # MX records
            mx_records: List[str] = []
            mx_found = False
            if domain_exists:
                mx_records = await async_get_mx_records(domain)
                mx_found = len(mx_records) > 0
                persist_mx_records = mx_records  # real DNS result, always safe to persist (even if empty)
            logger.info("mx_checked", email=email, mx_records=mx_records, mx_found=mx_found)

        # 6. SMTP verification (skip for trusted domains, disposables, or when no MX)
        smtp_valid = False
        catch_all = False
        if mx_found and not disposable and domain.lower() not in TRUSTED_DOMAINS:
            smtp_valid, catch_all = await async_verify_smtp(email, mx_records)
            logger.info("smtp_checked", email=email, smtp_valid=smtp_valid, catch_all=catch_all)

        # 7. Score & status determination
        username = normalized.split("@")[0]
        score, username_analysis = calculate_score(
            syntax_valid=syntactic_valid,
            domain_exists=domain_exists,
            mx_found=mx_found,
            smtp_valid=smtp_valid,
            disposable=disposable,
            catch_all=catch_all,
            domain=domain or "",
            username=username,
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

        logger.info("verify_done", email=email, status=status, score=score)

        return _build_response(
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
        )

    except Exception as e:
        logger.error(f"Email verification failed for {email}: {str(e)}", exc_info=True)
        # Return a safe fallback response indicating verification error
        return _build_error_response(email=email)


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
) -> EmailVerifyResponse:
    """Build a successful verification response."""
    from models.models import EmailStatus
    if status is None:
        status = EmailStatus.invalid

    # Only set verified_at for non-processing statuses
    verified_at = datetime.now(timezone.utc) if status != EmailStatus.processing else None

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
    )
