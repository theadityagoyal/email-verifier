"""
External developer API — single email verification.
Auth: X-API-Key header. Rate limit: api_key.rate_limit_per_min (default 60/min).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from models.models import ApiKey
from schemas.schemas import EmailVerifyRequest
from services.email_service import verify_email
from services.domain_service import async_upsert_email, async_upsert_domain
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
        logger.error("external_verify_failed", email=email, api_key_id=api_key.id, error=str(e), exc_info=True)
        return {
            "success": False,
            "error": {"code": "verification_failed", "message": "Email verification service failed"},
        }

    now = _utc_now_naive()

    try:
        # Atomic upsert — persists into the same `emails` table the
        # dashboard reads from, so external verifications show up in the
        # dashboard/email-list too, and can never race on duplicate emails.
        await async_upsert_email(db, result, job_id=None, now=now)

        if result.domain:
            await async_upsert_domain(db, result.domain, result.mx_records, now)
    except Exception as e:
        logger.error(
            "external_verify_persist_failed", email=email, api_key_id=api_key.id, error=str(e), exc_info=True
        )
        return {
            "success": False,
            "error": {"code": "storage_failed", "message": "Verification succeeded but failed to save the result"},
        }

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
