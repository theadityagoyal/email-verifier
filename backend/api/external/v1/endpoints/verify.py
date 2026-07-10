"""
External developer API — single email verification.
Auth: X-API-Key header. Rate limit: api_key.rate_limit_per_min (default 60/min).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import Email, Domain, ApiKey
from schemas.schemas import EmailVerifyRequest
from services.email_service import verify_email
from api.external.v1.dependencies import rate_limit_verify
from utils.logging import get_logger

router = APIRouter(prefix="/verify", tags=["External API - Verification"])
logger = get_logger(__name__)


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.post("")
async def external_verify_email(
    payload: EmailVerifyRequest,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(rate_limit_verify),
):
    """
    Verify a single email address.

    Request body:  {"email": "someone@example.com"}
    Response:      {"success": true, "data": {...verification result...}}
    """
    email = payload.email
    if not email or not email.strip():
        return {
            "success": False,
            "error": {"code": "invalid_request", "message": "Email address cannot be empty"},
        }

    try:
        result = await verify_email(email)
    except Exception as e:
        logger.error("external_verify_failed", email=email, api_key_id=api_key.id, error=str(e))
        return {
            "success": False,
            "error": {"code": "verification_failed", "message": "Email verification service failed"},
        }

    verified_at_naive = result.verified_at.replace(tzinfo=None) if result.verified_at else None
    now = _utc_now_naive()

    # Persist / upsert into the same `emails` table the dashboard reads from,
    # so external verifications show up in the dashboard/email-list too.
    existing = (
        await db.execute(select(Email).where(Email.email == result.email))
    ).scalar_one_or_none()

    if existing:
        existing.domain = result.domain
        existing.status = result.status
        existing.syntax_valid = result.syntax_valid
        existing.domain_exists = result.domain_exists
        existing.mx_found = result.mx_found
        existing.smtp_valid = result.smtp_valid
        existing.disposable = result.disposable
        existing.role_based = result.role_based
        existing.catch_all = result.catch_all
        existing.score = result.score
        existing.verified_at = verified_at_naive
        existing.updated_at = now
    else:
        db.add(Email(
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
            job_id=None,
            verified_at=verified_at_naive,
            created_at=now,
            updated_at=now,
        ))

    if result.domain:
        try:
            domain_rec = (
                await db.execute(select(Domain).where(Domain.domain == result.domain))
            ).scalar_one_or_none()
            if not domain_rec:
                domain_rec = Domain(domain=result.domain)
                db.add(domain_rec)
                await db.flush()
            domain_rec.total_emails = (domain_rec.total_emails or 0) + 1
        except Exception as e:
            logger.warning("external_domain_update_failed", domain=result.domain, error=str(e))

    await db.commit()

    logger.info("external_verify_success", email=email, api_key_id=api_key.id, status=result.status.value)

    return {
        "success": True,
        "data": {
            "email": result.email,
            "domain": result.domain,
            "status": result.status.value,
            "score": result.score,
            "syntax_valid": result.syntax_valid,
            "domain_exists": result.domain_exists,
            "mx_found": result.mx_found,
            "smtp_valid": result.smtp_valid,
            "disposable": result.disposable,
            "role_based": result.role_based,
            "catch_all": result.catch_all,
            "verified_at": result.verified_at.isoformat() if result.verified_at else None,
        },
    }