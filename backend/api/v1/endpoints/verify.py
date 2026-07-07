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
    result = await verify_email(payload.email)

    # Convert aware datetime from service to naive for storage
    verified_at_naive = (
        result.verified_at.replace(tzinfo=None) if result.verified_at else None
    )

    # Persist / update
    existing = (
        await db.execute(select(Email).where(Email.email == result.email))
    ).scalar_one_or_none()

    now = _utc_now_naive()

    if existing:
        # Update fields individually, handling verified_at conversion
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
        # Create new Email instance with naive datetimes
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

    # Update domain stats
    if result.domain:
        await _upsert_domain(db, result)

    return result


async def _upsert_domain(db: AsyncSession, result: EmailVerifyResponse):
    from models.models import EmailStatus
    domain_rec = (
        await db.execute(select(Domain).where(Domain.domain == result.domain))
    ).scalar_one_or_none()

    if not domain_rec:
        domain_rec = Domain(domain=result.domain)
        db.add(domain_rec)
        await db.flush()

    domain_rec.total_emails = (domain_rec.total_emails or 0) + 1
    if result.status == EmailStatus.verified:
        domain_rec.verified_count = (domain_rec.verified_count or 0) + 1
    elif result.status == EmailStatus.invalid:
        domain_rec.invalid_count = (domain_rec.invalid_count or 0) + 1
    elif result.status == EmailStatus.risky:
        domain_rec.risky_count = (domain_rec.risky_count or 0) + 1

    total = domain_rec.total_emails or 1
    domain_rec.bounce_rate = round((domain_rec.invalid_count or 0) / total * 100, 2)