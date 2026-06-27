from datetime import datetime, timezone

from validators.syntax_validator import validate_syntax, is_role_based
from validators.dns_validator import async_check_domain_exists, async_get_mx_records
from validators.smtp_validator import async_verify_smtp
from validators.disposable_checker import is_disposable
from validators.score_calculator import calculate_score, determine_status
from schemas.schemas import EmailVerifyResponse
from utils.logging import get_logger

logger = get_logger(__name__)


async def verify_email(email: str) -> EmailVerifyResponse:
    """
    Full async pipeline:
      syntax → domain DNS → MX lookup → SMTP → disposable/role checks → score
    """
    logger.info("verify_start", email=email)

    # 1. Syntax
    syntactic_valid, normalized, domain = validate_syntax(email)
    logger.info("syntax_checked", email=email, syntax_valid=syntactic_valid, domain=domain)
    if not syntactic_valid:
        return _build_response(
            email=email,
            domain=None,
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
    from validators.score_calculator import TRUSTED_DOMAINS
    if domain.lower() in TRUSTED_DOMAINS:
        domain_exists = True
        mx_found = True
        mx_records = [f"mx.{domain}"]
    else:
        # Domain DNS existence
        domain_exists = await async_check_domain_exists(domain)
        logger.info("domain_checked", email=email, domain_exists=domain_exists)

        # MX records
        mx_records: list[str] = []
        mx_found = False
        if domain_exists:
            mx_records = await async_get_mx_records(domain)
            mx_found = len(mx_records) > 0
        logger.info("mx_checked", email=email, mx_records=mx_records, mx_found=mx_found)

    # 6. SMTP — Trusted domains pe skip karo
    smtp_valid = False
    catch_all = False
    if mx_found and not disposable and domain.lower() not in TRUSTED_DOMAINS:
        smtp_valid, catch_all = await async_verify_smtp(email, mx_records)
        logger.info("smtp_checked", email=email, smtp_valid=smtp_valid, catch_all=catch_all)

    # 7. Score & status
    # ── CHANGE 1: username extract karo aur calculate_score ko pass karo ──
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

    # ── CHANGE 2: username_analysis fields pass karo _build_response mein ──
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
    )


# ── CHANGE 3: _build_response mein 2 naye parameters + EmailVerifyResponse mein pass ──
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
    username_flags: list | None = None,
) -> EmailVerifyResponse:
    from models.models import EmailStatus
    if status is None:
        status = EmailStatus.invalid
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
        verified_at=datetime.now(timezone.utc) if status != "processing" else None,
    )