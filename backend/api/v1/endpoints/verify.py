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

    # Persist / update
    existing = (
        await db.execute(select(Email).where(Email.email == result.email))
    ).scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing:
        for field in ("domain", "status", "syntax_valid", "domain_exists",
                      "mx_found", "smtp_valid", "disposable", "role_based",
                      "catch_all", "score", "verified_at"):
            setattr(existing, field, getattr(result, field))
        existing.updated_at = now
    else:
        db.add(Email(**result.model_dump(exclude={"username_quality", "username_flags"}), created_at=now, updated_at=now))

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
