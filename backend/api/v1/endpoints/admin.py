"""
Admin endpoints for the API Keys management dashboard.

Auth: POST /admin/login exchanges ADMIN_PASSWORD (from .env) for a stateless
signed token (see utils/admin_auth.py), valid 24 hours. Every other endpoint
here requires that token via the X-Admin-Token header (`require_admin`).
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from models.models import ApiKey, ApiKeyUsageLog
from schemas.schemas import (
    AdminLoginRequest, AdminLoginResponse,
    ApiKeyListItem, ApiKeyCreateRequest, ApiKeyCreateResponse,
    ApiKeyUsageResponse, DailyUsageItem,
)
from utils.config import settings
from utils.admin_auth import create_admin_token, require_admin
from utils.api_key import generate_api_key
from utils.logging import get_logger

router = APIRouter(prefix="/admin", tags=["Admin"])
logger = get_logger(__name__)


@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest):
    """Exchange the admin password for a 24h signed token."""
    if not settings.ADMIN_PASSWORD or payload.password != settings.ADMIN_PASSWORD:
        logger.warning("admin_login_failed")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin password")

    logger.info("admin_login_success")
    return AdminLoginResponse(token=create_admin_token())


@router.get("/api-keys", response_model=list[ApiKeyListItem], dependencies=[Depends(require_admin)])
async def list_api_keys(db: AsyncSession = Depends(get_db)):
    """All API keys, newest first, with total call counts from the usage log."""
    keys = (
        await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    ).scalars().all()

    count_rows = (
        await db.execute(
            select(ApiKeyUsageLog.api_key_id, func.count(ApiKeyUsageLog.id))
            .group_by(ApiKeyUsageLog.api_key_id)
        )
    ).all()
    counts_map = {row[0]: row[1] for row in count_rows}

    return [
        ApiKeyListItem(
            name=k.name,
            prefix=k.key_prefix,
            is_active=k.is_active,
            rate_limit_per_min=k.rate_limit_per_min,
            bulk_limit_per_hour=k.bulk_limit_per_hour,
            total_calls=counts_map.get(k.id, 0),
            last_used_at=k.last_used_at,
            created_at=k.created_at,
        )
        for k in keys
    ]


@router.post(
    "/api-keys",
    response_model=ApiKeyCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_api_key(payload: ApiKeyCreateRequest, db: AsyncSession = Depends(get_db)):
    """Create a new external API key. The full plaintext key is returned
    exactly once — only its SHA-256 hash is stored, same as the existing
    scripts/manage_api_keys.py CLI."""
    full_key, key_hash, key_prefix = generate_api_key()

    api_key = ApiKey(
        key_hash=key_hash,
        key_prefix=key_prefix,
        name=payload.name,
        is_active=True,
        rate_limit_per_min=payload.rate_limit_per_min,
        bulk_limit_per_hour=payload.bulk_limit_per_hour,
    )
    db.add(api_key)
    await db.commit()

    logger.info("admin_api_key_created", prefix=key_prefix, name=payload.name)

    return ApiKeyCreateResponse(
        api_key=full_key,
        prefix=key_prefix,
        name=payload.name,
        rate_limit_per_min=payload.rate_limit_per_min,
        bulk_limit_per_hour=payload.bulk_limit_per_hour,
    )


async def _get_key_or_404(db: AsyncSession, prefix: str) -> ApiKey:
    key = (
        await db.execute(select(ApiKey).where(ApiKey.key_prefix == prefix))
    ).scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")
    return key


@router.post("/api-keys/{prefix}/activate", dependencies=[Depends(require_admin)])
async def activate_api_key(prefix: str, db: AsyncSession = Depends(get_db)):
    key = await _get_key_or_404(db, prefix)
    key.is_active = True
    await db.commit()
    logger.info("admin_api_key_activated", prefix=prefix)
    return {"message": "activated", "prefix": prefix}


@router.post("/api-keys/{prefix}/revoke", dependencies=[Depends(require_admin)])
async def revoke_api_key(prefix: str, db: AsyncSession = Depends(get_db)):
    key = await _get_key_or_404(db, prefix)
    key.is_active = False
    await db.commit()
    logger.info("admin_api_key_revoked", prefix=prefix)
    return {"message": "revoked", "prefix": prefix}


@router.get(
    "/api-keys/{prefix}/usage",
    response_model=ApiKeyUsageResponse,
    dependencies=[Depends(require_admin)],
)
async def get_api_key_usage(
    prefix: str,
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Daily call counts for the last `days` days, split by endpoint (verify/bulk)."""
    key = await _get_key_or_404(db, prefix)

    start_date = datetime.utcnow() - timedelta(days=days)
    rows = (
        await db.execute(
            select(
                func.date(ApiKeyUsageLog.created_at).label("day"),
                ApiKeyUsageLog.endpoint,
                func.count(ApiKeyUsageLog.id),
            )
            .where(ApiKeyUsageLog.api_key_id == key.id, ApiKeyUsageLog.created_at >= start_date)
            .group_by("day", ApiKeyUsageLog.endpoint)
            .order_by("day")
        )
    ).all()

    daily_map: dict[str, dict] = {}
    for day, endpoint, count in rows:
        day_str = str(day)
        entry = daily_map.setdefault(day_str, {"date": day_str, "verify": 0, "bulk": 0})
        if endpoint in ("verify", "bulk"):
            entry[endpoint] = count

    daily = sorted(daily_map.values(), key=lambda d: d["date"])

    return ApiKeyUsageResponse(
        prefix=prefix,
        days=days,
        daily=[DailyUsageItem(**d) for d in daily],
    )
