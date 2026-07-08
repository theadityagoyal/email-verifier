from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from models.database import get_db
from models.models import Email, Domain
from schemas.schemas import EmailVerifyRequest, EmailVerifyResponse
from services.email_service import verify_email
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

        # Convert aware datetime from service to naive for storage
        verified_at_naive = (
            result.verified_at.replace(tzinfo=None) if result.verified_at else None
        )

        # Check if email already exists in database
        existing = (
            await db.execute(select(Email).where(Email.email == result.email))
        ).scalar_one_or_none()

        now = _utc_now_naive()

        if existing:
            # Update existing record
            logger.debug(f"Updating existing record for email: {email}")
            update_data = {
                "domain": result.domain,
                "status": result.status,
                "syntax_valid": result.syntax_valid,
                "domain_exists": result.domain_exists,
                "mx_found": result.mx_found,
                "smtp_valid": result.smtp_valid,
                "disposable": result.disposable,
                "role_based": result.role_based,
                "catch_all": result.catch_all,
                "score": result.score,
                "verified_at": verified_at_naive,
            }
            for field, value in update_data.items():
                setattr(existing, field, value)
            existing.updated_at = now
        else:
            # Create new record
            logger.debug(f"Creating new record for email: {email}")
            email_obj = Email(
                email=result.email,
                domain=result.domain,
                status=result.status,
                syntax_valid=result.syntax_valid,
                domain_exists=result.domain_exists,
                mx_found=result.mx_found,
                smtp_valid=result.smtp_valid,
                disposable=result.disposable,
                role_based=result.role_based,
                catch_all=result.catch_all,
                score=result.score,
                job_id=None,  # single verify endpoint doesn't associate with a job
                verified_at=verified_at_naive,
                created_at=now,
                updated_at=now,
            )
            db.add(email_obj)

        # Update domain stats with transaction safety
        if result.domain:
            try:
                await _upsert_domain(db, result)
                logger.debug(f"Updated domain stats for: {result.domain}")
            except Exception as domain_error:
                # Log domain error but don't fail the entire request
                logger.warning(f"Failed to update domain stats for {result.domain}: {str(domain_error)}")
                # Continue - the main email verification was successful

        # Commit the transaction
        await db.commit()
        logger.info(f"Email verification and storage completed successfully for: {email}")

        return result

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Handle unexpected errors
        await db.rollback()  # Rollback any pending transaction
        logger.error(f"Unexpected error during email verification for {payload.email}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during email verification: {str(e)}"
        )


async def _upsert_domain(db: AsyncSession, result: EmailVerifyResponse):
    """Update or insert domain statistics."""
    try:
        from models.models import EmailStatus

        # Try to get existing domain record
        domain_rec = (
            await db.execute(select(Domain).where(Domain.domain == result.domain))
        ).scalar_one_or_none()

        if not domain_rec:
            # Create new domain record
            domain_rec = Domain(domain=result.domain)
            db.add(domain_rec)
            await db.flush()  # Get the ID without committing

        # Update counters (this could have race issues but we'll handle gracefully)
        domain_rec.total_emails = (domain_rec.total_emails or 0) + 1
        if result.status == EmailStatus.verified:
            domain_rec.verified_count = (domain_rec.verified_count or 0) + 1
        elif result.status == EmailStatus.invalid:
            domain_rec.invalid_count = (domain_rec.invalid_count or 0) + 1
        elif result.status == EmailStatus.risky:
            domain_rec.risky_count = (domain_rec.risky_count or 0) + 1

        # Recalculate bounce rate
        total = domain_rec.total_emails or 1
        domain_rec.bounce_rate = round((domain_rec.invalid_count or 0) / total * 100, 2)

    except Exception as e:
        # Log the error but don't let it break the main flow
        logger.warning(f"Error updating domain stats for {result.domain}: {str(e)}")
        # Don't re-raise - the main email verification was successful