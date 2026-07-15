"""
External developer API — single email verification.
Auth: X-API-Key header. Rate limit: api_key.rate_limit_per_min (default 60/min).
"""
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db, AsyncSessionLocal
from models.models import ApiKey
from schemas.schemas import EmailVerifyRequest
from services.email_service import verify_email
from services.domain_service import async_upsert_email, async_upsert_email_processing, async_upsert_domain
from api.external.v1.dependencies import rate_limit_verify
from utils.usage_logger import log_api_usage
from utils.logging import get_logger
from utils.timezone import utc_now_naive

router = APIRouter(prefix="/verify", tags=["External API - Verification"])
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


async def _save_result(result, now) -> None:
    """Save verification result in a short-lived session."""
    async with AsyncSessionLocal() as session:
        try:
            await async_upsert_email(session, result, job_id=None, now=now)
            if result.domain:
                await async_upsert_domain(session, result.domain, result.mx_records, now)
            await session.commit()
        except Exception as e:
            logger.error(
                f"Failed to persist verification result for {result.email}: {str(e)}",
                exc_info=True,
            )
            await session.rollback()
            raise


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
    # Tracks the logical status of this response for usage logging below.
    # Auth/rate-limit failures (401/429) are logged separately inside the
    # rate_limit_verify dependency, since those never reach this point.
    resp_status = 200

    try:
        email = payload.email
        if not email or not email.strip():
            resp_status = 400
            return {
                "success": False,
                "error": {"code": "invalid_request", "message": "Email address cannot be empty"},
            }

        domain = _extract_domain(email)
        now = utc_now_naive()

        # Step 1: Mark as processing (short-lived session)
        await _mark_processing(email, domain, now)

        # Step 2: Run verification (no DB session held)
        try:
            result = await verify_email(email)
        except Exception as e:
            logger.error("external_verify_failed", email=email, api_key_id=api_key.id, error=str(e), exc_info=True)
            resp_status = 500
            return {
                "success": False,
                "error": {"code": "verification_failed", "message": "Email verification service failed"},
            }

        # Step 3: Save result (short-lived session)
        try:
            await _save_result(result, now)
        except Exception as e:
            logger.error(
                "external_verify_persist_failed", email=email, api_key_id=api_key.id, error=str(e), exc_info=True
            )
            resp_status = 500
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
    finally:
        await log_api_usage(api_key.id, "verify", resp_status)