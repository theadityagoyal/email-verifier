from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db, AsyncSessionLocal
from models.models import EmailStatus
from schemas.schemas import EmailVerifyRequest, EmailVerifyResponse
from services.email_service import verify_email
from services.domain_service import async_upsert_email_processing
from utils.logging import get_logger
from utils.timezone import utc_now_naive

router = APIRouter(prefix="/verify-email", tags=["Verification"])
logger = get_logger(__name__)


def _extract_domain(email: str) -> str:
    """Extract domain from email address."""
    return email.split('@')[-1].lower() if '@' in email else ''


async def _mark_processing(email: str, domain: str, now) -> None:
    """Mark email as processing in a short-lived session."""
    async with AsyncSessionLocal() as session:
        try:
            await async_upsert_email_processing(session, email, domain, job_id=None, now=now)
            await session.commit()
        except Exception as e:
            logger.warning(
                f"Failed to mark email as processing for {email}: {str(e)}",
                exc_info=False,
            )
            await session.rollback()


@router.post("", response_model=EmailVerifyResponse, status_code=status.HTTP_200_OK)
async def verify_email_endpoint(payload: EmailVerifyRequest, force_fresh: bool = False):
    """
    Verify a single email address through the full validation pipeline.
    Checks: syntax, domain DNS, MX records, SMTP, disposable, role-based, catch-all.

    NOTE (smart verification reuse): actual persistence of the Email/Domain
    rows now happens INSIDE services.email_service.verify_email() itself,
    guarded by a per-email lock (utils/verification_lock.py) — this closes
    the race window where two overlapping requests for the same address
    could otherwise both run a full (duplicate) DNS/SMTP check. This
    endpoint no longer calls a separate _save_result step.

    Args:
        force_fresh: If true, bypass TTL cache and force fresh DNS/SMTP checks
    """
    email = payload.email
    domain = _extract_domain(email)
    now = utc_now_naive()

    logger.info(f"Starting email verification for: {email}", force_fresh=force_fresh)

    # Validate email is not empty after stripping (additional validation beyond schema)
    if not email or not email.strip():
        logger.warning(f"Empty email provided for verification")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address cannot be empty"
        )

    # Step 1: Mark as processing (short-lived session) — immediate UI feedback
    await _mark_processing(email, domain, now)

    # Step 2: Run verification. Persists its own result internally.
    try:
        result = await verify_email(email, force_fresh=force_fresh)
    except Exception as e:
        logger.error(f"Verification service failed for {email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Email verification service failed"
        )

    if result is None:
        logger.error(f"Verification service returned None for email: {email}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Email verification service failed"
        )

    logger.info(
        f"Email verification completed for {email}: {result.status.value} "
        f"(record_existed={result.record_existed}, dns_reused={result.dns_reused}, "
        f"smtp_reused={result.smtp_reused})"
    )

    return result
