"""
Shared, best-effort usage logging for the external developer API
(/api/external/v1/verify and /bulk). Powers the admin dashboard's
API Keys usage chart and total-calls column.

Logging failures must never break the actual API response — insert
is wrapped in try/except, same pattern as domain_service.py's
best-effort domain bookkeeping.
"""
from sqlalchemy.ext.asyncio import AsyncSession

from models.models import ApiKeyUsageLog
from utils.logging import get_logger

logger = get_logger(__name__)


async def log_api_usage(db: AsyncSession, api_key_id: int, endpoint: str, status_code: int) -> None:
    """Insert one usage row. Commits immediately so the log survives even if
    the caller's request subsequently raises (and get_db() rolls back)."""
    try:
        db.add(ApiKeyUsageLog(api_key_id=api_key_id, endpoint=endpoint, status_code=status_code))
        await db.commit()
    except Exception as exc:
        logger.warning("usage_log_failed", api_key_id=api_key_id, endpoint=endpoint, error=str(exc))
