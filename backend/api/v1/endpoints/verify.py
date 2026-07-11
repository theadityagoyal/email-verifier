from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone

from models.database import get_db
from schemas.schemas import EmailVerifyRequest, EmailVerifyResponse
from services.email_service import verify_email
from services.domain_service import async_upsert_email, async_upsert_domain
from utils.logging import get_logger

router = APIRouter(prefix="/verify-email", tags=["Verification"])
logger = get_logger(__name__)


def _utc_now_naive() -> datetime:
    """Return current UTC datetime as naive (tzinfo=None)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.post("", response_model=EmailVerifyResponse, status_code=status.HTTP_200_OK)
async def verify_email_endpoint(
    payload: EmailVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify a single email address through the full validation pipeline.
    Checks: syntax, domain DNS, MX records, SMTP, disposable, role-based, catch-all.
    """
    try:
        email = payload.email
        logger.info(f"Starting email verification for: {email}")

        # Validate email is not empty after stripping (additional validation beyond schema)
        if not email or not email.strip():
            logger.warning(f"Empty email provided for verification")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email address cannot be empty"
            )

        # Call the verification service
        result = await verify_email(email)

        # Validate that we got a result
        if result is None:
            logger.error(f"Verification service returned None for email: {email}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Email verification service failed"
            )

        logger.info(f"Email verification completed for {email}: {result.status.value}")

        now = _utc_now_naive()

        try:
            # Atomic upsert — no check-then-insert window, so two concurrent
            # requests verifying the same address can never race into an
            # IntegrityError anymore.
            await async_upsert_email(db, result, job_id=None, now=now)

            if result.domain:
                await async_upsert_domain(db, result.domain, result.mx_records, now)
        except Exception as persist_error:
            logger.error(
                f"Failed to persist verification result for {email}: {str(persist_error)}",
                exc_info=True,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save verification result"
            )

        logger.info(f"Email verification and storage completed successfully for: {email}")

        return result

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Unexpected error during email verification for {payload.email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during email verification: {str(e)}"
        )
