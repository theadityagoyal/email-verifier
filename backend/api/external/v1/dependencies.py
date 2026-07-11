"""
Shared FastAPI dependencies for the external developer API:
- get_api_key: validates the X-API-Key header against the api_keys table
- rate_limit_verify / rate_limit_bulk: per-key rate limiting on top of auth
"""
from datetime import datetime, timezone

from fastapi import Header, HTTPException, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import ApiKey
from utils.api_key import hash_api_key
from utils.rate_limiter import verify_rate_limiter, bulk_rate_limiter
from utils.logging import get_logger

logger = get_logger(__name__)


async def get_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """Validates the API key sent in the X-API-Key header."""
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "missing_api_key", "message": "X-API-Key header is required"},
        )

    key_hash = hash_api_key(x_api_key)
    result = await db.execute(select(ApiKey).where(ApiKey.key_hash == key_hash))
    api_key = result.scalar_one_or_none()

    if not api_key:
        logger.warning("external_api_invalid_key_attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "invalid_api_key", "message": "Invalid API key"},
        )

    if not api_key.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "revoked_api_key", "message": "This API key has been revoked"},
        )

    # NOTE: no db.commit() here — FastAPI's Depends() caches this dependency
    # per-request, so this same AsyncSession is shared with the endpoint
    # handler and its own db.execute() calls. get_db() commits the whole
    # request's work in one transaction when the request finishes
    # successfully, so committing here too was just a redundant extra
    # round-trip to MySQL on every single external API call.
    api_key.last_used_at = datetime.now(timezone.utc).replace(tzinfo=None)

    return api_key


async def rate_limit_verify(api_key: ApiKey = Depends(get_api_key)) -> ApiKey:
    """Auth + per-minute rate limit for single-email verification."""
    allowed, retry_after = verify_rate_limiter.check(
        f"verify:{api_key.id}", api_key.rate_limit_per_min, 60
    )
    if not allowed:
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


async def rate_limit_bulk(api_key: ApiKey = Depends(get_api_key)) -> ApiKey:
    """Auth + per-hour rate limit for bulk uploads."""
    allowed, retry_after = bulk_rate_limiter.check(
        f"bulk:{api_key.id}", api_key.bulk_limit_per_hour, 3600
    )
    if not allowed:
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
