import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, cast, Date, func, Integer, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd
from models.database import get_db
from models.models import Email, Domain, Job, EmailStatus, JobStatus
from schemas.schemas import (
    DashboardStats, PaginatedEmailsResponse, DomainStats,
    EmailVerifyResponse, VerificationTrend,
    ActiveJob, DomainOverview, PaginatedDomainsResponse,
)
from utils.config import settings
from utils.logging import get_logger

router = APIRouter(tags=["Dashboard"])
logger = get_logger(__name__)

SAFE_STATUSES = [EmailStatus.verified, EmailStatus.deliverable, EmailStatus.trusted, EmailStatus.probably_valid]
RISKY_STATUSES = [EmailStatus.risky, EmailStatus.unconfirmed, EmailStatus.uncertain]
UNSAFE_STATUSES = [EmailStatus.invalid, EmailStatus.undeliverable]
ALL_STATUSES = SAFE_STATUSES + RISKY_STATUSES + UNSAFE_STATUSES + [EmailStatus.processing]

# Domains-page thresholds — kept next to bucket_case() so anyone touching
# risk bands sees the bucket source of truth right above it.
LOW_SAMPLE_THRESHOLD = 5   # total_emails below this -> "Low Sample" verdict
RISK_HEALTHY_MAX = 10      # risk_percent below this -> "Healthy"
RISK_WATCH_MAX = 30        # risk_percent below this -> "Watch", else "High Risk"
NEW_DOMAIN_DAYS = 7        # first_seen within this many days -> is_new
TREND_WINDOW_DAYS = 7      # size of each comparison window for trend
TREND_DELTA_PCT = 2        # minimum pp change to call it up/down instead of stable

DOMAIN_SORT_OPTIONS = {"risk", "total", "trust", "domain", "newest"}


def bucket_case():
    """
    Per-row SQL CASE expression — every email is classified exactly once.
    No approximation/proportional math: disposable and role_based/catch_all
    overrides are applied per-row inside the database query itself.
    Order matters: disposable wins over everything; role_based/catch_all only
    downgrades a currently-Safe row to Risky (never touches Risky/Unsafe rows).
    """
    return case(
        (Email.disposable.is_(True), "unsafe"),
        (
            and_(
                Email.status.in_(SAFE_STATUSES),
                or_(Email.role_based.is_(True), Email.catch_all.is_(True)),
            ),
            "risky",
        ),
        (Email.status.in_(SAFE_STATUSES), "safe"),
        (Email.status.in_(RISKY_STATUSES), "risky"),
        (Email.status.in_(UNSAFE_STATUSES), "unsafe"),
        (Email.status == EmailStatus.processing, "processing"),
        else_="unsafe",
    )


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(days: int = Query(7, ge=1, le=365),db: AsyncSession = Depends(get_db),):
    """Aggregate stats for the dashboard overview — safe/risky/unsafe bucket logic,
    trust score, flagged counts, top domains, daily volume, active job."""

    # 1. Total emails
    total_result = await db.execute(select(func.count(Email.id)))
    total_emails = total_result.scalar() or 0

    # 2. Per-status counts — all 10 statuses, zero-filled
    status_rows = (
        await db.execute(select(Email.status, func.count(Email.id)).group_by(Email.status))
    ).all()
    raw_status_counts = {row[0]: row[1] for row in status_rows}
    per_status_counts = {s.value: raw_status_counts.get(s, 0) for s in ALL_STATUSES}

    # 3. Bucket counts — one query, per-row classification, no approximation
    bucket_expr = bucket_case()
    bucket_rows = (
        await db.execute(select(bucket_expr.label("bucket"), func.count(Email.id)).group_by(bucket_expr))
    ).all()
    raw_bucket_counts = {row[0]: row[1] for row in bucket_rows}
    bucket_counts = {
        "safe": raw_bucket_counts.get("safe", 0),
        "risky": raw_bucket_counts.get("risky", 0),
        "unsafe": raw_bucket_counts.get("unsafe", 0),
        "processing": raw_bucket_counts.get("processing", 0),
    }

    # 4. Trust score — processing excluded from denominator
    denom = bucket_counts["safe"] + bucket_counts["risky"] + bucket_counts["unsafe"]
    trust_score = round((bucket_counts["safe"] / denom) * 100) if denom > 0 else 0

    # 5. Flagged counts — independent of status/bucket
    flag_row = (
        await db.execute(
            select(
                func.sum(cast(Email.disposable, Integer)),
                func.sum(cast(Email.role_based, Integer)),
                func.sum(cast(Email.catch_all, Integer)),
            )
        )
    ).one()
    flagged_counts = {
        "disposable": flag_row[0] or 0,
        "role_based": flag_row[1] or 0,
        "catch_all": flag_row[2] or 0,
    }

    # 6. Top domains — live per-row aggregation from Email table (not the
    # legacy Domain.verified_count/invalid_count/risky_count columns, which
    # only track the old 3-bucket system and would be wrong here).
    domain_bucket_rows = (
        await db.execute(
            select(Email.domain, bucket_expr.label("bucket"), func.count(Email.id))
            .where(Email.domain.isnot(None))
            .group_by(Email.domain, bucket_expr)
        )
    ).all()

    domain_map = {}
    for domain, bucket, count in domain_bucket_rows:
        entry = domain_map.setdefault(
            domain, {"domain": domain, "safe": 0, "risky": 0, "unsafe": 0, "processing": 0, "total": 0}
        )
        entry[bucket] = count
        entry["total"] += count

    top_domains = sorted(domain_map.values(), key=lambda d: d["total"], reverse=True)[:30]
    for d in top_domains:
        denom_d = d["safe"] + d["risky"] + d["unsafe"]
        d["risk_pct"] = round(((d["risky"] + d["unsafe"]) / denom_d) * 100) if denom_d > 0 else 0

    # 7. Daily volume — last 7 days, flat bucket counts per day
    start_date = datetime.utcnow() - timedelta(days=days)
    daily_rows = (
        await db.execute(
            select(func.date(Email.created_at).label("day"), bucket_expr.label("bucket"), func.count(Email.id))
            .where(Email.created_at >= start_date)
            .group_by("day", bucket_expr)
            .order_by("day")
        )
    ).all()

    daily_map = {}
    for day, bucket, count in daily_rows:
        day_str = str(day)
        entry = daily_map.setdefault(
            day_str, {"date": day_str, "safe": 0, "risky": 0, "unsafe": 0, "processing": 0}
        )
        entry[bucket] = count
    daily_volume = sorted(daily_map.values(), key=lambda d: d["date"])

    # 8. Active job
    active_job_row = (
        await db.execute(
            select(Job).where(Job.status == JobStatus.processing).order_by(Job.started_at.desc()).limit(1)
        )
    ).scalar_one_or_none()

    active_job = None
    if active_job_row:
        active_job = {
            "job_id": active_job_row.job_id,
            "file_name": active_job_row.file_name,
            "progress_percent": active_job_row.progress_percent,
            "processed": active_job_row.processed,
            "total": active_job_row.total,
        }

    return DashboardStats(
        total_emails=total_emails,
        per_status_counts=per_status_counts,
        bucket_counts=bucket_counts,
        trust_score=trust_score,
        flagged_counts=flagged_counts,
        top_domains=top_domains,
        daily_volume=daily_volume,
        active_job=active_job,
    )


@router.get("/dashboard/trends", response_model=list[VerificationTrend])
async def get_trends(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Legacy endpoint — kept for backward compatibility. The current dashboard
    UI uses /dashboard/stats -> daily_volume instead of this endpoint."""
    rows = (
        await db.execute(
            select(
                cast(Email.verified_at, Date).label("date"),
                Email.status,
                func.count(Email.id).label("cnt"),
            )
            .where(Email.verified_at.isnot(None))
            .group_by(cast(Email.updated_at, Date), Email.status)
            .order_by(cast(Email.updated_at, Date))
            .limit(days * 3)
        )
    ).all()

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

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()

    offset = (page - 1) * size
    items_result = await db.execute(query.order_by(Email.created_at).offset(offset).limit(size))
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

    df = pd.DataFrame(
        [
            {
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
            }
            for e in emails
        ]
    )

    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=export.csv"},
    )


# ── Domains ───────────────────────────────────────────────────────────────
#
# Everything below is aggregated live from Email using bucket_case(), the
# exact same expression the dashboard uses. The Domain table is only ever
# touched for its cached mx_records — Domain.verified_count/invalid_count/
# risky_count/bounce_rate are legacy columns from the old 3-bucket system
# and must never be read for analytics again.


def _domain_aggregate_subquery(search: str | None = None):
    """One row per domain: totals, bucket counts, flag counts, first_seen.
    Built directly on bucket_case() so bucket definitions can't drift
    between the dashboard and this page."""
    bucket_expr = bucket_case()

    stmt = (
        select(
            Email.domain.label("domain"),
            func.count(Email.id).label("total_emails"),
            func.sum(case((bucket_expr == "safe", 1), else_=0)).label("safe_count"),
            func.sum(case((bucket_expr == "risky", 1), else_=0)).label("risky_count"),
            func.sum(case((bucket_expr == "unsafe", 1), else_=0)).label("unsafe_count"),
            func.sum(case((bucket_expr == "processing", 1), else_=0)).label("processing_count"),
            func.sum(cast(Email.disposable, Integer)).label("disposable_count"),
            func.sum(cast(Email.role_based, Integer)).label("role_based_count"),
            func.sum(cast(Email.catch_all, Integer)).label("catch_all_count"),
            func.min(Email.created_at).label("first_seen"),
        )
        .where(Email.domain.isnot(None))
        .group_by(Email.domain)
    )

    if search:
        stmt = stmt.where(Email.domain.ilike(f"%{search}%"))

    return stmt.subquery()


def _risk_and_trust_exprs(domain_subq):
    """risk_percent = (risky + unsafe) / total; trust_score = safe / total.
    Same definitions as the dashboard's trust score, just per-domain."""
    denom = domain_subq.c.safe_count + domain_subq.c.risky_count + domain_subq.c.unsafe_count
    risk_percent_expr = case(
        (denom > 0, (domain_subq.c.risky_count + domain_subq.c.unsafe_count) * 100.0 / denom),
        else_=0.0,
    )
    trust_score_expr = case(
        (denom > 0, domain_subq.c.safe_count * 100.0 / denom),
        else_=0.0,
    )
    return risk_percent_expr, trust_score_expr


def _verdict(total_emails: int, risk_percent: float) -> str:
    if total_emails < LOW_SAMPLE_THRESHOLD:
        return "Low Sample"
    if risk_percent < RISK_HEALTHY_MAX:
        return "Healthy"
    if risk_percent < RISK_WATCH_MAX:
        return "Watch"
    return "High Risk"


def _mx_status(mx_records) -> str:
    if mx_records is None:
        return "Unknown"
    if len(mx_records) == 0:
        return "No MX"
    return "Valid"


@router.get("/domains/overview", response_model=DomainOverview)
async def get_domains_overview(db: AsyncSession = Depends(get_db)):
    """Summary cards for the Domains page. Reuses bucket_case() so
    safe/risky/unsafe here always match the dashboard's numbers."""
    domain_subq = _domain_aggregate_subquery()
    risk_percent_expr, trust_score_expr = _risk_and_trust_exprs(domain_subq)

    rows = (
        await db.execute(
            select(
                domain_subq.c.domain,
                domain_subq.c.total_emails,
                domain_subq.c.safe_count,
                domain_subq.c.risky_count,
                domain_subq.c.unsafe_count,
                domain_subq.c.processing_count,
                domain_subq.c.disposable_count,
                domain_subq.c.role_based_count,
                domain_subq.c.catch_all_count,
                domain_subq.c.first_seen,
                risk_percent_expr.label("risk_percent"),
                trust_score_expr.label("trust_score"),
            )
        )
    ).all()

    # Cached MX records — only used here to count "No MX" domains.
    mx_map = {}
    if rows:
        mx_rows = (
            await db.execute(
                select(Domain.domain, Domain.mx_records).where(
                    Domain.domain.in_([r.domain for r in rows])
                )
            )
        ).all()
        mx_map = {d: mx for d, mx in mx_rows}

    now = datetime.utcnow()
    total_domains = len(rows)
    total_emails = sum(r.total_emails for r in rows)
    safe = sum(r.safe_count for r in rows)
    risky = sum(r.risky_count for r in rows)
    unsafe = sum(r.unsafe_count for r in rows)
    processing = sum(r.processing_count for r in rows)
    flagged_domains = sum(
        1 for r in rows if r.disposable_count or r.role_based_count or r.catch_all_count
    )
    disposable_domains = sum(1 for r in rows if r.disposable_count)
    catch_all_domains = sum(1 for r in rows if r.catch_all_count)
    no_mx_domains = sum(1 for r in rows if _mx_status(mx_map.get(r.domain)) == "No MX")
    new_domains_count = sum(
        1 for r in rows if r.first_seen and (now - r.first_seen) <= timedelta(days=NEW_DOMAIN_DAYS)
    )
    average_risk_percent = (
        round(sum(r.risk_percent for r in rows) / total_domains, 1) if total_domains else 0.0
    )
    average_trust_score = (
        round(sum(r.trust_score for r in rows) / total_domains) if total_domains else 0
    )

    return DomainOverview(
        total_domains=total_domains,
        total_emails=total_emails,
        safe=safe,
        risky=risky,
        unsafe=unsafe,
        processing=processing,
        flagged_domains=flagged_domains,
        disposable_domains=disposable_domains,
        catch_all_domains=catch_all_domains,
        no_mx_domains=no_mx_domains,
        new_domains_count=new_domains_count,
        average_risk_percent=average_risk_percent,
        average_trust_score=average_trust_score,
    )


@router.get("/domains", response_model=PaginatedDomainsResponse)
async def list_domains(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    sort: str = Query(default="risk"),
    db: AsyncSession = Depends(get_db),
):
    """Domain analytics — aggregated live from Email via bucket_case().
    Default sort is highest risk first, tied domains broken by total emails."""
    if sort not in DOMAIN_SORT_OPTIONS:
        sort = "risk"

    domain_subq = _domain_aggregate_subquery(search)
    risk_percent_expr, trust_score_expr = _risk_and_trust_exprs(domain_subq)

    total = (await db.execute(select(func.count()).select_from(domain_subq))).scalar_one()

    sort_map = {
        "risk": (risk_percent_expr.desc(), domain_subq.c.total_emails.desc()),
        "total": (domain_subq.c.total_emails.desc(),),
        "trust": (trust_score_expr.desc(),),
        "domain": (domain_subq.c.domain.asc(),),
        "newest": (domain_subq.c.first_seen.desc(),),
    }

    stmt = (
        select(
            domain_subq.c.domain,
            domain_subq.c.total_emails,
            domain_subq.c.safe_count,
            domain_subq.c.risky_count,
            domain_subq.c.unsafe_count,
            domain_subq.c.processing_count,
            domain_subq.c.disposable_count,
            domain_subq.c.role_based_count,
            domain_subq.c.catch_all_count,
            domain_subq.c.first_seen,
            risk_percent_expr.label("risk_percent"),
            trust_score_expr.label("trust_score"),
        )
        .order_by(*sort_map[sort])
        .offset((page - 1) * size)
        .limit(size)
    )

    rows = (await db.execute(stmt)).all()
    domains_on_page = [r.domain for r in rows]

    # Cached MX records — the only thing the Domain table is still used for.
    mx_map = {}
    if domains_on_page:
        mx_rows = (
            await db.execute(
                select(Domain.domain, Domain.mx_records).where(Domain.domain.in_(domains_on_page))
            )
        ).all()
        mx_map = {d: mx for d, mx in mx_rows}

    # 7-day risk trend per domain, same bucket_expr windowed by date, so
    # up/down/stable can never disagree with the safe/risky/unsafe counts.
    trend_map = {}
    trend_delta_map = {}
    if domains_on_page:
        bucket_expr = bucket_case()
        now = datetime.utcnow()
        window_start = now - timedelta(days=TREND_WINDOW_DAYS)
        prev_start = now - timedelta(days=TREND_WINDOW_DAYS * 2)
        window_expr = case((Email.created_at >= window_start, "recent"), else_="previous")

        trend_rows = (
            await db.execute(
                select(
                    Email.domain,
                    window_expr.label("window"),
                    func.sum(case((bucket_expr.in_(["risky", "unsafe"]), 1), else_=0)).label("bad"),
                    func.count(Email.id).label("total"),
                )
                .where(Email.domain.in_(domains_on_page), Email.created_at >= prev_start)
                .group_by(Email.domain, window_expr)
            )
        ).all()

        window_stats: dict[str, dict] = {}
        for domain, window, bad, tot in trend_rows:
            window_stats.setdefault(domain, {})[window] = (bad, tot)

        for domain, windows in window_stats.items():
            recent_bad, recent_total = windows.get("recent", (0, 0))
            prev_bad, prev_total = windows.get("previous", (0, 0))
            recent_pct = (recent_bad / recent_total * 100) if recent_total else None
            prev_pct = (prev_bad / prev_total * 100) if prev_total else None
            if recent_pct is None or prev_pct is None:
                trend_map[domain] = "stable"
                trend_delta_map[domain] = None
            else:
                delta = recent_pct - prev_pct
                trend_delta_map[domain] = round(delta, 1)
                if delta > TREND_DELTA_PCT:
                    trend_map[domain] = "up"
                elif delta < -TREND_DELTA_PCT:
                    trend_map[domain] = "down"
                else:
                    trend_map[domain] = "stable"

    now = datetime.utcnow()
    items = []
    for r in rows:
        mx_records = mx_map.get(r.domain)
        is_new = bool(r.first_seen and (now - r.first_seen) <= timedelta(days=NEW_DOMAIN_DAYS))
        items.append(
            DomainStats(
                domain=r.domain,
                total_emails=r.total_emails,
                safe_count=r.safe_count,
                risky_count=r.risky_count,
                unsafe_count=r.unsafe_count,
                processing_count=r.processing_count,
                risk_percent=round(r.risk_percent, 1),
                trust_score=round(r.trust_score),
                verdict=_verdict(r.total_emails, r.risk_percent),
                disposable_count=r.disposable_count or 0,
                role_based_count=r.role_based_count or 0,
                catch_all_count=r.catch_all_count or 0,
                mx_records=mx_records,
                mx_status=_mx_status(mx_records),
                first_seen=r.first_seen,
                trend=trend_map.get(r.domain, "stable"),
                trend_delta_pct=trend_delta_map.get(r.domain),
                is_new=is_new,
                low_sample=r.total_emails < LOW_SAMPLE_THRESHOLD,
            )
        )

    return PaginatedDomainsResponse(
        items=items,
        total=total,
        page=page,
        size=size,
        pages=(total + size - 1) // size,
    )


@router.delete("/emails/{email}")
async def delete_email(
    email: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a single email record by its email address."""
    existing = (await db.execute(select(Email).where(Email.email == email))).scalar_one_or_none()

    if not existing:
        raise HTTPException(status_code=404, detail="Email not found")

    await db.delete(existing)
    await db.commit()
    return {"message": "deleted", "email": email}
