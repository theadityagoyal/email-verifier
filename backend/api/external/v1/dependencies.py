"""
Shared FastAPI dependencies for the external developer API:
- get_api_key: validates the X-API-Key header against the api_keys table
- rate_limit_verify / rate_limit_bulk: per-key rate limiting on top of auth
"""
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import AsyncSessionLocal
from models.models import ApiKey
from utils.api_key import hash_api_key
from utils.rate_limiter import verify_rate_limiter, bulk_rate_limiter
from utils.usage_logger import log_api_usage
from utils.logging import get_logger
from utils.timezone import utc_now_naive

logger = get_logger(__name__)


def _endpoint_from_path(request: Request) -> str:
    """Best-effort endpoint classification for usage logging, based on the
    request path (/verify vs /bulk*)."""
    return "bulk" if "/bulk" in request.url.path else "verify"


async def _get_api_key_from_db(x_api_key: str) -> ApiKey | None:
    """Fetch API key by hash using a short-lived session."""
    async with AsyncSessionLocal() as session:
        key_hash = hash_api_key(x_api_key)
        result = await session.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
        return result.scalar_one_or_none()


async def _update_last_used(api_key_id: int) -> None:
    """Update last_used_at using a short-lived session."""
    async with AsyncSessionLocal() as session:
        try:
            result = await session.execute(select(ApiKey).where(ApiKey.id == api_key_id))
            api_key = result.scalar_one_or_none()
            if api_key:
                api_key.last_used_at = utc_now_naive()
                await session.commit()
        except Exception as e:
            logger.warning("update_last_used_failed", api_key_id=api_key_id, error=str(e))
            await session.rollback()


async def get_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> ApiKey:
    """Validates the API key sent in the X-API-Key header."""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_api_key", "message": "X-API-Key header is required"},
        )

    api_key = await _get_api_key_from_db(x_api_key)

    if not api_key:
        logger.warning("external_api_invalid_key_attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_api_key", "message": "Invalid API key"},
        )

    if not api_key.is_active:
        # We have a real api_key.id here, so this is loggable — unlike the
        # missing/invalid-key cases above where there's no key to attach the
        # log row to.
        await log_api_usage(api_key.id, _endpoint_from_path(request), status.HTTP_401_UNAUTHORIZED)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "revoked_api_key", "message": "This API key has been revoked"},
        )

    # Update last_used_at in background (short-lived session)
    await _update_last_used(api_key.id)

    return api_key


async def rate_limit_verify(
    request: Request,
    api_key: ApiKey = Depends(get_api_key),
) -> ApiKey:
    """Auth + per-minute rate limit for single-email verification."""
    allowed, retry_after = verify_rate_limiter.check(
        f"verify:{api_key.id}", api_key.rate_limit_per_min, 60
    )
    if not allowed:
        await log_api_usage(api_key.id, "verify", status.HTTP_429_TOO_MANY_REQUESTS)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limit_exceeded",
                "message": f"Rate limit exceeded ({api_key.rate_limit_per_min}/min). "
                           f"Retry after {retry_after}s.",
            },
            headers={"Retry-After": str(retry_after)},
        )
    return api_key


async def rate_limit_bulk(
    request: Request,
    api_key: ApiKey = Depends(get_api_key),
) -> ApiKey:
    """Auth + per-hour rate limit for bulk uploads."""
    allowed, retry_after = bulk_rate_limiter.check(
        f"bulk:{api_key.id}", api_key.bulk_limit_per_hour, 3600
    )
    if not allowed:
        await log_api_usage(api_key.id, "bulk", status.HTTP_429_TOO_MANY_REQUESTS)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "rate_limit_exceeded",
                "message": f"Bulk upload rate limit exceeded ({api_key.bulk_limit_per_hour}/hour). "
                           f"Retry after {retry_after}s.",
            },
            headers={"Retry-After": str(retry_after)},
        )
    return api_key