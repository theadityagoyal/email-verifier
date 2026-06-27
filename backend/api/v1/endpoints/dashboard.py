import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
import pandas as pd
import redis

from models.database import get_db
from models.models import Email, Domain, Job, EmailStatus
from schemas.schemas import (
    DashboardStats, PaginatedEmailsResponse, DomainStats,
    EmailVerifyResponse, VerificationTrend,
)
from utils.config import settings
from utils.logging import get_logger

router = APIRouter(tags=["Dashboard"])
logger = get_logger(__name__)


def _get_redis():
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate stats for the dashboard overview cards."""
    rows = (await db.execute(
        select(Email.status, func.count(Email.id).label("cnt"))
        .group_by(Email.status)
    )).all()

    counts = {r.status: r.cnt for r in rows}

    # Queue size from Redis
    try:
        r = _get_redis()
        queue_size = r.llen("celery") or 0
    except Exception:
        queue_size = 0

    total = sum(counts.values())
    verified = counts.get(EmailStatus.verified, 0)

    return DashboardStats(
        total_emails=total,
        verified=verified,
        invalid=counts.get(EmailStatus.invalid, 0),
        risky=counts.get(EmailStatus.risky, 0),
        processing=counts.get(EmailStatus.processing, 0),
        queue_size=queue_size,
        success_rate=round(verified / total * 100, 2) if total else 0.0,
    )


@router.get("/dashboard/trends", response_model=list[VerificationTrend])
async def get_trends(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Daily verification trend for the last N days."""
    rows = (await db.execute(
        select(
            cast(Email.verified_at, Date).label("date"),
            Email.status,
            func.count(Email.id).label("cnt"),
        )
        .where(Email.verified_at.isnot(None))
        .group_by(cast(Email.verified_at, Date), Email.status)
        .order_by(cast(Email.verified_at, Date))
        .limit(days * 3)
    )).all()

    # Pivot
    pivot: dict[str, dict] = {}
    for r in rows:
        key = str(r.date)
        if key not in pivot:
            pivot[key] = {"date": key, "verified": 0, "invalid": 0, "risky": 0}
        if r.status == EmailStatus.verified:
            pivot[key]["verified"] += r.cnt
        elif r.status == EmailStatus.invalid:
            pivot[key]["invalid"] += r.cnt
        elif r.status == EmailStatus.risky:
            pivot[key]["risky"] += r.cnt

    return [VerificationTrend(**v) for v in pivot.values()]


@router.get("/emails", response_model=PaginatedEmailsResponse)
async def list_emails(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    status: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Paginated, searchable, filterable email list."""
    query = select(Email)

    if search:
        query = query.where(Email.email.ilike(f"%{search}%"))
    if status:
        try:
            query = query.where(Email.status == EmailStatus(status))
        except ValueError:
            pass
    if domain:
        query = query.where(Email.domain == domain)

    total_result = await db.execute(
        select(func.count()).select_from(query.subquery())
    )
    total = total_result.scalar_one()

    offset = (page - 1) * size
    items_result = await db.execute(
        query.order_by(Email.created_at.desc()).offset(offset).limit(size)
    )
    items = items_result.scalars().all()

    return PaginatedEmailsResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/emails/export")
async def export_emails(
    status: str | None = Query(default=None),
    domain: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Export filtered emails as CSV."""
    query = select(Email)
    if status:
        try:
            query = query.where(Email.status == EmailStatus(status))
        except ValueError:
            pass
    if domain:
        query = query.where(Email.domain == domain)

    emails = (await db.execute(query.limit(100_000))).scalars().all()

    df = pd.DataFrame([{
        "email": e.email,
        "domain": e.domain,
        "status": e.status.value if e.status else "",
        "score": e.score,
        "syntax_valid": e.syntax_valid,
        "domain_exists": e.domain_exists,
        "mx_found": e.mx_found,
        "smtp_valid": e.smtp_valid,
        "disposable": e.disposable,
        "role_based": e.role_based,
        "catch_all": e.catch_all,
        "verified_at": str(e.verified_at) if e.verified_at else "",
    } for e in emails])

    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=emails_export.csv"},
    )


@router.get("/domains", response_model=list[DomainStats])
async def list_domains(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Domain analytics with stats."""
    offset = (page - 1) * size
    domains = (await db.execute(
        select(Domain)
        .order_by(Domain.total_emails.desc())
        .offset(offset)
        .limit(size)
    )).scalars().all()

    return [
        DomainStats(
            domain=d.domain,
            total_emails=d.total_emails or 0,
            verified_count=d.verified_count or 0,
            invalid_count=d.invalid_count or 0,
            risky_count=d.risky_count or 0,
            bounce_rate=d.bounce_rate or 0.0,
            mx_records=d.mx_records,
        )
        for d in domains
    ]
@router.delete("/emails/{email}")
async def delete_email(
    email: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single email record by its email address."""
    from fastapi import HTTPException

    existing = (
        await db.execute(select(Email).where(Email.email == email))
    ).scalar_one_or_none()

    if not existing:
        raise HTTPException(status_code=404, detail="Email not found")

    await db.delete(existing)
    await db.commit()
    return {"message": "deleted", "email": email}