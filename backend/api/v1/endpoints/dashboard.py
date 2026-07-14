import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, cast, Date, delete, func, Integer, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
import pandas as pd
from models.database import get_db
from models.models import Email, Domain, Job, EmailStatus, JobStatus
from schemas.schemas import (
    DashboardStats, PaginatedEmailsResponse, DomainStats,
    EmailVerifyResponse, VerificationTrend,
    ActiveJob, DomainOverview, PaginatedDomainsResponse,
    FlaggedOverview, DomainSummary,
)
from utils.config import settings
from utils.logging import get_logger

router = APIRouter(tags=["Dashboard"])
logger = get_logger(__name__)

SAFE_STATUSES = [EmailStatus.verified, EmailStatus.deliverable, EmailStatus.trusted, EmailStatus.probably_valid]
RISKY_STATUSES = [EmailStatus.risky, EmailStatus.unconfirmed, EmailStatus.uncertain]
UNSAFE_STATUSES = [EmailStatus.invalid, EmailStatus.undeliverable]
ALL_STATUSES = SAFE_STATUSES + RISKY_STATUSES + UNSAFE_STATUSES + [EmailStatus.processing]

LOW_SAMPLE_THRESHOLD = 5
RISK_HEALTHY_MAX = 10
RISK_WATCH_MAX = 30
NEW_DOMAIN_DAYS = 7
TREND_WINDOW_DAYS = 7
TREND_DELTA_PCT = 2

DAY_TREND_HOURS = 24
SPEED_WINDOW_MINUTES = 5
PROCESSING_TIME_WINDOW_HOURS = 24

MAX_REASONABLE_PROCESSING_SECONDS = 300

DOMAIN_SORT_OPTIONS = {"risk", "total", "trust", "domain", "newest"}
LEGACY_SORT_MAP = {
    "risk": ("risk_percent", "desc"),
    "total": ("total_emails", "desc"),
    "trust": ("risk_percent", "asc"),
    "domain": ("domain", "asc"),
    "newest": ("first_seen", "desc"),
}

SORTABLE_DOMAIN_FIELDS = {
    "domain", "total_emails", "safe", "risky", "unsafe",
    "risk_percent", "trend", "mx_status", "first_seen",
}
DEFAULT_SORT_BY = "first_seen"
DEFAULT_SORT_ORDER = "desc"

FLAGGED_FILTER_OPTIONS = {"any", "disposable", "role_based", "catch_all"}

# ── FIX (audit #7): server-side sort for /emails ─────────────────────────────
# Whitelisted so sort_by can never be interpolated into raw SQL.
SORTABLE_EMAIL_FIELDS = {"email", "domain", "status", "score", "verified_at", "created_at"}
DEFAULT_EMAIL_SORT_BY = "created_at"
DEFAULT_EMAIL_SORT_ORDER = "desc"

# ── FIX (audit #2): domain verdict labels, kept in sync with _verdict() ─────
DOMAIN_VERDICT_OPTIONS = {"Healthy", "Watch", "High Risk", "Low Sample"}
DOMAIN_MX_STATUS_OPTIONS = {"Valid", "No MX", "Unknown"}
DOMAIN_FLAG_OPTIONS = {"Disposable", "Role Based", "Catch All"}


def bucket_case():
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


async def _compute_dashboard_trends(db: AsyncSession):
    now = datetime.utcnow()
    day_start = now - timedelta(hours=DAY_TREND_HOURS)
    prev_start = now - timedelta(hours=DAY_TREND_HOURS * 2)

    window_expr = case((Email.created_at >= day_start, "recent"), else_="previous")
    bucket_expr = bucket_case()

    status_rows = (
        await db.execute(
            select(Email.status, window_expr.label("window"), func.count(Email.id))
            .where(Email.created_at >= prev_start)
            .group_by(Email.status, window_expr)
        )
    ).all()

    status_window_map: dict = {}
    for status, window, count in status_rows:
        status_window_map.setdefault(status, {})[window] = count

    per_status_trend = {}
    for s in ALL_STATUSES:
        windows = status_window_map.get(s, {})
        recent = windows.get("recent", 0)
        prev = windows.get("previous", 0)
        per_status_trend[s.value] = recent - prev

    bucket_rows = (
        await db.execute(
            select(bucket_expr.label("bucket"), window_expr.label("window"), func.count(Email.id))
            .where(Email.created_at >= prev_start)
            .group_by(bucket_expr, window_expr)
        )
    ).all()

    bucket_window_map: dict = {}
    for bucket, window, count in bucket_rows:
        bucket_window_map.setdefault(bucket, {})[window] = count

    bucket_trend_pct = {}
    total_recent = 0
    total_prev = 0
    for b in ["safe", "risky", "unsafe", "processing"]:
        windows = bucket_window_map.get(b, {})
        recent = windows.get("recent", 0)
        prev = windows.get("previous", 0)
        total_recent += recent
        total_prev += prev
        if prev > 0:
            bucket_trend_pct[b] = round(((recent - prev) / prev) * 100, 1)
        else:
            bucket_trend_pct[b] = 100.0 if recent > 0 else 0.0

    if total_prev > 0:
        total_trend_pct = round(((total_recent - total_prev) / total_prev) * 100, 1)
    else:
        total_trend_pct = 100.0 if total_recent > 0 else 0.0

    return per_status_trend, bucket_trend_pct, total_trend_pct


async def _compute_speed_and_processing_time(db: AsyncSession):
    now = datetime.utcnow()

    speed_start = now - timedelta(minutes=SPEED_WINDOW_MINUTES)
    speed_count_row = await db.execute(
        select(func.count(Email.id)).where(
            Email.verified_at.isnot(None),
            Email.verified_at >= speed_start
        )
    )
    speed_count = speed_count_row.scalar() or 0
    verification_speed = round(speed_count / (SPEED_WINDOW_MINUTES * 60), 1)

    proc_start = now - timedelta(hours=PROCESSING_TIME_WINDOW_HOURS)
    diff_expr = func.timestampdiff(text("SECOND"), Email.created_at, Email.verified_at)

    avg_seconds_row = await db.execute(
        select(func.avg(diff_expr)).where(
            Email.verified_at.isnot(None),
            Email.created_at.isnot(None),
            Email.verified_at >= proc_start,
            Email.status.in_(ALL_STATUSES),
            diff_expr.between(0, MAX_REASONABLE_PROCESSING_SECONDS),
        )
    )
    avg_seconds = avg_seconds_row.scalar()

    if avg_seconds is not None and avg_seconds > 0:
        avg_processing_time_ms = round(float(avg_seconds) * 1000, 1)
    else:
        fallback_row = await db.execute(
            select(func.avg(diff_expr)).where(
                Email.verified_at.isnot(None),
                Email.created_at.isnot(None),
                Email.verified_at >= now - timedelta(hours=48),
                diff_expr.between(0, MAX_REASONABLE_PROCESSING_SECONDS),
            )
        )
        fallback_seconds = fallback_row.scalar()
        if fallback_seconds is not None and fallback_seconds > 0:
            avg_processing_time_ms = round(float(fallback_seconds) * 1000, 1)
        else:
            avg_processing_time_ms = 0.0

    return verification_speed, avg_processing_time_ms


async def _compute_flagged_overview(db: AsyncSession):
    now = datetime.utcnow()
    day_start = now - timedelta(hours=24)
    prev_start = now - timedelta(hours=48)
    week_start = now - timedelta(days=7)
    prev_week_start = now - timedelta(days=14)

    flagged_expr = or_(Email.disposable.is_(True), Email.role_based.is_(True), Email.catch_all.is_(True))

    totals_row = (
        await db.execute(
            select(
                func.sum(case((flagged_expr, 1), else_=0)),
                func.sum(cast(Email.disposable, Integer)),
            )
        )
    ).one()
    total_flagged = totals_row[0] or 0
    high_priority = totals_row[1] or 0

    total_emails = (await db.execute(select(func.count(Email.id)))).scalar() or 0
    flag_rate = round((total_flagged / total_emails) * 100, 1) if total_emails else 0.0

    last_7_days = (
        await db.execute(
            select(func.sum(case((flagged_expr, 1), else_=0))).where(Email.created_at >= week_start)
        )
    ).scalar() or 0

    def pct_delta(recent_val, prev_val):
        if prev_val:
            return round(((recent_val - prev_val) / prev_val) * 100, 1)
        return 100.0 if recent_val else 0.0

    window_expr = case((Email.created_at >= day_start, "recent"), else_="previous")
    trend_rows = (
        await db.execute(
            select(
                window_expr.label("window"),
                func.sum(case((flagged_expr, 1), else_=0)).label("flagged"),
                func.sum(cast(Email.disposable, Integer)).label("disposable"),
                func.count(Email.id).label("total"),
            )
            .where(Email.created_at >= prev_start)
            .group_by(window_expr)
        )
    ).all()
    tw = {row.window: row for row in trend_rows}
    recent, prev = tw.get("recent"), tw.get("previous")

    total_flagged_trend_pct = pct_delta(recent.flagged if recent else 0, prev.flagged if prev else 0)
    high_priority_trend_pct = pct_delta(recent.disposable if recent else 0, prev.disposable if prev else 0)

    recent_rate = float(recent.flagged / recent.total * 100) if recent and recent.total else 0.0
    prev_rate = float(prev.flagged / prev.total * 100) if prev and prev.total else 0.0
    flag_rate_trend_pct = round(recent_rate - prev_rate, 1)

    prev_week_flagged = (
        await db.execute(
            select(func.sum(case((flagged_expr, 1), else_=0))).where(
                Email.created_at >= prev_week_start, Email.created_at < week_start
            )
        )
    ).scalar() or 0
    last_7_days_trend_pct = pct_delta(last_7_days, prev_week_flagged)

    return FlaggedOverview(
        total_flagged=total_flagged,
        total_flagged_trend_pct=total_flagged_trend_pct,
        high_priority=high_priority,
        high_priority_trend_pct=high_priority_trend_pct,
        flag_rate=flag_rate,
        flag_rate_trend_pct=flag_rate_trend_pct,
        last_7_days=last_7_days,
        last_7_days_trend_pct=last_7_days_trend_pct,
    )


async def _compute_domain_summary(db: AsyncSession, domain_map: dict, bucket_expr):
    now = datetime.utcnow()
    week_start = now - timedelta(days=TREND_WINDOW_DAYS)
    prev_week_start = now - timedelta(days=TREND_WINDOW_DAYS * 2)

    all_domains = list(domain_map.values())
    for d in all_domains:
        denom_d = d["safe"] + d["risky"] + d["unsafe"]
        d["risk_pct"] = round(((d["risky"] + d["unsafe"]) / denom_d) * 100) if denom_d > 0 else 0

    sample_domains = [d for d in all_domains if (d["safe"] + d["risky"] + d["unsafe"]) >= LOW_SAMPLE_THRESHOLD]
    total_domains_count = len(all_domains)
    avg_reputation = (
        round(sum(100 - d["risk_pct"] for d in sample_domains) / len(sample_domains))
        if sample_domains else 0
    )
    high_risk_count = sum(1 for d in sample_domains if d["risk_pct"] >= RISK_WATCH_MAX)

    def pct_delta(cur, prev):
        if prev:
            return round(((cur - prev) / prev) * 100, 1)
        return 100.0 if cur else 0.0

    domain_trend = {}
    domain_names = [d["domain"] for d in sample_domains]
    if domain_names:
        window_expr = case((Email.created_at >= week_start, "recent"), else_="previous")
        rows = (
            await db.execute(
                select(
                    Email.domain,
                    window_expr.label("window"),
                    func.sum(case((bucket_expr.in_(["risky", "unsafe"]), 1), else_=0)).label("bad"),
                    func.count(Email.id).label("total"),
                )
                .where(Email.domain.in_(domain_names), Email.created_at >= prev_week_start)
                .group_by(Email.domain, window_expr)
            )
        ).all()
        stats = {}
        for domain, window, bad, tot in rows:
            stats.setdefault(domain, {})[window] = (bad, tot)
        for domain, windows in stats.items():
            r_bad, r_tot = windows.get("recent", (0, 0))
            p_bad, p_tot = windows.get("previous", (0, 0))
            if r_tot and p_tot:
                delta = (r_bad / r_tot * 100) - (p_bad / p_tot * 100)
                domain_trend[domain] = (
                    "down" if delta < -TREND_DELTA_PCT else ("up" if delta > TREND_DELTA_PCT else "stable")
                )
            else:
                domain_trend[domain] = "stable"

    improving_count = sum(1 for t in domain_trend.values() if t == "down")

    prev_rows = (
        await db.execute(
            select(Email.domain, bucket_expr.label("bucket"), func.count(Email.id))
            .where(Email.domain.isnot(None), Email.created_at < week_start)
            .group_by(Email.domain, bucket_expr)
        )
    ).all()
    prev_map = {}
    for domain, bucket, count in prev_rows:
        entry = prev_map.setdefault(domain, {"safe": 0, "risky": 0, "unsafe": 0})
        entry[bucket] = entry.get(bucket, 0) + count

    prev_sample = []
    for domain, e in prev_map.items():
        denom_p = e.get("safe", 0) + e.get("risky", 0) + e.get("unsafe", 0)
        if denom_p >= LOW_SAMPLE_THRESHOLD:
            risk_pct_p = round(((e.get("risky", 0) + e.get("unsafe", 0)) / denom_p) * 100)
            prev_sample.append(risk_pct_p)

    prev_total_domains = len(prev_map)
    prev_avg_reputation = round(sum(100 - r for r in prev_sample) / len(prev_sample)) if prev_sample else 0
    prev_high_risk_count = sum(1 for r in prev_sample if r >= RISK_WATCH_MAX)

    return DomainSummary(
        avg_reputation=avg_reputation,
        avg_reputation_trend_pct=pct_delta(avg_reputation, prev_avg_reputation),
        high_risk_count=high_risk_count,
        high_risk_trend_pct=pct_delta(high_risk_count, prev_high_risk_count),
        total_domains=total_domains_count,
        total_domains_trend_pct=pct_delta(total_domains_count, prev_total_domains),
        improving_count=improving_count,
        improving_trend_pct=pct_delta(improving_count, max(len(domain_trend) - improving_count, 0)),
    )


@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats(days: int = Query(7, ge=1, le=365), db: AsyncSession = Depends(get_db)):
    total_result = await db.execute(select(func.count(Email.id)))
    total_emails = total_result.scalar() or 0

    status_rows = (
        await db.execute(select(Email.status, func.count(Email.id)).group_by(Email.status))
    ).all()
    raw_status_counts = {row[0]: row[1] for row in status_rows}
    per_status_counts = {s.value: raw_status_counts.get(s, 0) for s in ALL_STATUSES}

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

    denom = bucket_counts["safe"] + bucket_counts["risky"] + bucket_counts["unsafe"]
    trust_score = round((bucket_counts["safe"] / denom) * 100) if denom > 0 else 0

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

    per_status_trend, bucket_trend_pct, total_emails_trend_pct = await _compute_dashboard_trends(db)
    verification_speed, avg_processing_time_ms = await _compute_speed_and_processing_time(db)
    flagged_overview = await _compute_flagged_overview(db)
    domain_summary = await _compute_domain_summary(db, domain_map, bucket_expr)

    return DashboardStats(
        total_emails=total_emails,
        per_status_counts=per_status_counts,
        bucket_counts=bucket_counts,
        trust_score=trust_score,
        flagged_counts=flagged_counts,
        top_domains=top_domains,
        daily_volume=daily_volume,
        active_job=active_job,
        per_status_trend=per_status_trend,
        bucket_trend_pct=bucket_trend_pct,
        total_emails_trend_pct=total_emails_trend_pct,
        verification_speed=verification_speed,
        avg_processing_time_ms=avg_processing_time_ms,
        flagged_overview=flagged_overview,
        domain_summary=domain_summary,
        generated_at=datetime.now(timezone.utc),
    )


@router.get("/dashboard/trends", response_model=list[VerificationTrend])
async def get_trends(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
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
    score_min: int | None = Query(default=None, ge=0, le=100),
    score_max: int | None = Query(default=None, ge=0, le=100),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    flagged: str | None = Query(default=None),
    order: str = Query(default="asc"),
    # FIX (audit #7): real server-side sort. `order` (asc|desc on created_at)
    # is kept for backward compat with existing callers (e.g.
    # VerifyEmailPage's "Recent Verifications"); sort_by/sort_order is the
    # new, general per-column contract mirroring /domains.
    sort_by: str | None = Query(
        default=None,
        description=f"One of {sorted(SORTABLE_EMAIL_FIELDS)}. Omit to fall back to created_at.",
    ),
    sort_order: str = Query(default=DEFAULT_EMAIL_SORT_ORDER, description="asc | desc"),
    db: AsyncSession = Depends(get_db),
):
    query = select(Email)

    if search:
        query = query.where(Email.email.ilike(f"%{search}%"))

    BUCKET_NAMES = {"safe", "risky", "unsafe", "processing"}
    if status:
        if status in BUCKET_NAMES:
            query = query.where(bucket_case() == status)
        else:
            try:
                query = query.where(Email.status == EmailStatus(status))
            except ValueError:
                pass

    if domain:
        query = query.where(Email.domain.ilike(f"%{domain}%"))

    if score_min is not None:
        query = query.where(Email.score >= score_min)
    if score_max is not None:
        query = query.where(Email.score <= score_max)

    if date_from:
        try:
            df = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.where(Email.created_at >= df)
        except ValueError:
            pass
    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
            query = query.where(Email.created_at < dt)
        except ValueError:
            pass

    if flagged == "any":
        query = query.where(
            or_(Email.disposable.is_(True), Email.role_based.is_(True), Email.catch_all.is_(True))
        )
    elif flagged in FLAGGED_FILTER_OPTIONS:
        query = query.where(getattr(Email, flagged).is_(True))

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar_one()

    offset = (page - 1) * size

    # Whitelisted sort target map — sort_by is only ever used as a dict key.
    sortable_columns = {
        "email": Email.email,
        "domain": Email.domain,
        "status": Email.status,
        "score": Email.score,
        "verified_at": Email.verified_at,
        "created_at": Email.created_at,
    }

    normalized_sort_order = sort_order.lower() if sort_order else DEFAULT_EMAIL_SORT_ORDER
    if normalized_sort_order not in ("asc", "desc"):
        normalized_sort_order = DEFAULT_EMAIL_SORT_ORDER

    if sort_by and sort_by in SORTABLE_EMAIL_FIELDS:
        sort_col = sortable_columns[sort_by]
        order_col = sort_col.asc() if normalized_sort_order == "asc" else sort_col.desc()
    else:
        # Legacy `order` param still honored when no sort_by is given.
        order_col = Email.created_at.desc() if order == "desc" else Email.created_at.asc()

    items_result = await db.execute(
        query.order_by(order_col, Email.id.desc()).offset(offset).limit(size)
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

def _domain_aggregate_subquery(search: str | None = None):
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


def _trend_subquery(prev_start: datetime, window_start: datetime):
    bucket_expr = bucket_case()
    return (
        select(
            Email.domain.label("domain"),
            func.sum(
                case((and_(Email.created_at >= window_start, bucket_expr.in_(["risky", "unsafe"])), 1), else_=0)
            ).label("recent_bad"),
            func.sum(case((Email.created_at >= window_start, 1), else_=0)).label("recent_total"),
            func.sum(
                case(
                    (
                        and_(
                            Email.created_at >= prev_start,
                            Email.created_at < window_start,
                            bucket_expr.in_(["risky", "unsafe"]),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ).label("prev_bad"),
            func.sum(
                case((and_(Email.created_at >= prev_start, Email.created_at < window_start), 1), else_=0)
            ).label("prev_total"),
        )
        .where(Email.domain.isnot(None), Email.created_at >= prev_start)
        .group_by(Email.domain)
        .subquery()
    )


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


def _build_domains_query(
    domain_subq, risk_percent_expr, trust_score_expr, trend_subq, trend_delta_expr,
    trend_label_expr, mx_status_expr,
    risk_filter: str | None, mx_filter: str | None, flags_filter: str | None, min_emails: int | None,
):
    """Shared WHERE-clause builder for the paginated list AND the full export,
    so both always agree on what "matches the current filters" means.
    FIX (audit #2): risk/mx/flags/min-emails filters previously only ever
    applied client-side to the current page's 20 rows, silently breaking
    pagination totals. Now applied server-side, before LIMIT/OFFSET."""
    conditions = []

    if risk_filter and risk_filter in DOMAIN_VERDICT_OPTIONS:
        if risk_filter == "Low Sample":
            conditions.append(domain_subq.c.total_emails < LOW_SAMPLE_THRESHOLD)
        elif risk_filter == "Healthy":
            conditions.append(and_(domain_subq.c.total_emails >= LOW_SAMPLE_THRESHOLD, risk_percent_expr < RISK_HEALTHY_MAX))
        elif risk_filter == "Watch":
            conditions.append(and_(domain_subq.c.total_emails >= LOW_SAMPLE_THRESHOLD, risk_percent_expr >= RISK_HEALTHY_MAX, risk_percent_expr < RISK_WATCH_MAX))
        elif risk_filter == "High Risk":
            conditions.append(and_(domain_subq.c.total_emails >= LOW_SAMPLE_THRESHOLD, risk_percent_expr >= RISK_WATCH_MAX))

    if mx_filter and mx_filter in DOMAIN_MX_STATUS_OPTIONS:
        conditions.append(mx_status_expr == mx_filter)

    if flags_filter and flags_filter in DOMAIN_FLAG_OPTIONS:
        flag_col_map = {
            "Disposable": domain_subq.c.disposable_count,
            "Role Based": domain_subq.c.role_based_count,
            "Catch All": domain_subq.c.catch_all_count,
        }
        conditions.append(flag_col_map[flags_filter] > 0)

    if min_emails is not None:
        conditions.append(domain_subq.c.total_emails >= min_emails)

    return conditions


@router.get("/domains", response_model=PaginatedDomainsResponse)
async def list_domains(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    sort_by: str | None = Query(default=None),
    sort_order: str = Query(default=DEFAULT_SORT_ORDER),
    sort: str | None = Query(default=None),
    # FIX (audit #2): server-side filters, mirroring the DomainFilters UI.
    risk_filter: str | None = Query(default=None, description=f"One of {sorted(DOMAIN_VERDICT_OPTIONS)}"),
    mx_status: str | None = Query(default=None, description=f"One of {sorted(DOMAIN_MX_STATUS_OPTIONS)}"),
    flags: str | None = Query(default=None, description=f"One of {sorted(DOMAIN_FLAG_OPTIONS)}"),
    min_emails: int | None = Query(default=None, ge=0),
    db: AsyncSession = Depends(get_db),
):
    normalized_order = sort_order.lower() if sort_order else DEFAULT_SORT_ORDER
    if normalized_order not in ("asc", "desc"):
        normalized_order = DEFAULT_SORT_ORDER

    if sort_by and sort_by in SORTABLE_DOMAIN_FIELDS:
        resolved_sort_by = sort_by
        resolved_sort_order = normalized_order
    elif sort and sort in LEGACY_SORT_MAP:
        resolved_sort_by, resolved_sort_order = LEGACY_SORT_MAP[sort]
    else:
        resolved_sort_by, resolved_sort_order = DEFAULT_SORT_BY, DEFAULT_SORT_ORDER

    domain_subq = _domain_aggregate_subquery(search)
    risk_percent_expr, trust_score_expr = _risk_and_trust_exprs(domain_subq)

    now = datetime.utcnow()
    window_start = now - timedelta(days=TREND_WINDOW_DAYS)
    prev_start = now - timedelta(days=TREND_WINDOW_DAYS * 2)
    trend_subq = _trend_subquery(prev_start, window_start)

    recent_pct_expr = case(
        (trend_subq.c.recent_total > 0, trend_subq.c.recent_bad * 100.0 / trend_subq.c.recent_total),
        else_=None,
    )
    prev_pct_expr = case(
        (trend_subq.c.prev_total > 0, trend_subq.c.prev_bad * 100.0 / trend_subq.c.prev_total),
        else_=None,
    )
    trend_delta_expr = recent_pct_expr - prev_pct_expr
    trend_label_expr = case(
        (
            or_(
                trend_subq.c.recent_total.is_(None), trend_subq.c.recent_total == 0,
                trend_subq.c.prev_total.is_(None), trend_subq.c.prev_total == 0,
            ),
            "stable",
        ),
        (trend_delta_expr > TREND_DELTA_PCT, "up"),
        (trend_delta_expr < -TREND_DELTA_PCT, "down"),
        else_="stable",
    )

    mx_status_expr = case(
        (Domain.mx_records.is_(None), "Unknown"),
        (func.json_length(Domain.mx_records) == 0, "No MX"),
        else_="Valid",
    )

    filter_conditions = _build_domains_query(
        domain_subq, risk_percent_expr, trust_score_expr, trend_subq, trend_delta_expr,
        trend_label_expr, mx_status_expr, risk_filter, mx_status, flags, min_emails,
    )

    total_stmt = select(func.count()).select_from(domain_subq)
    if filter_conditions:
        # mx_status_expr/risk_percent_expr reference domain_subq/Domain, so
        # the count needs the same join context as the main query.
        total_stmt = (
            select(func.count())
            .select_from(domain_subq)
            .outerjoin(Domain, Domain.domain == domain_subq.c.domain)
            .where(and_(*filter_conditions))
        )
    total = (await db.execute(total_stmt)).scalar_one()

    sortable_columns = {
        "domain": domain_subq.c.domain,
        "total_emails": domain_subq.c.total_emails,
        "safe": domain_subq.c.safe_count,
        "risky": domain_subq.c.risky_count,
        "unsafe": domain_subq.c.unsafe_count,
        "risk_percent": risk_percent_expr,
        "trend": trend_delta_expr,
        "mx_status": mx_status_expr,
        "first_seen": domain_subq.c.first_seen,
    }
    sort_col = sortable_columns[resolved_sort_by]
    primary_order = (sort_col.asc() if resolved_sort_order == "asc" else sort_col.desc())

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
            trend_label_expr.label("trend"),
            trend_delta_expr.label("trend_delta_pct"),
            Domain.mx_records.label("mx_records"),
            mx_status_expr.label("mx_status"),
        )
        .select_from(domain_subq)
        .outerjoin(trend_subq, trend_subq.c.domain == domain_subq.c.domain)
        .outerjoin(Domain, Domain.domain == domain_subq.c.domain)
    )
    if filter_conditions:
        stmt = stmt.where(and_(*filter_conditions))

    stmt = (
        stmt.order_by(primary_order, domain_subq.c.domain.asc())
        .offset((page - 1) * size)
        .limit(size)
    )

    rows = (await db.execute(stmt)).all()

    items = []
    for r in rows:
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
                mx_records=r.mx_records,
                mx_status=r.mx_status,
                first_seen=r.first_seen,
                trend=r.trend,
                trend_delta_pct=round(r.trend_delta_pct, 1) if r.trend_delta_pct is not None else None,
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
        sort_by=resolved_sort_by,
        sort_order=resolved_sort_order,
    )


@router.get("/domains/export")
async def export_domains(
    search: str | None = Query(default=None),
    risk_filter: str | None = Query(default=None),
    mx_status: str | None = Query(default=None),
    flags: str | None = Query(default=None),
    min_emails: int | None = Query(default=None, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """FIX (audit #8): real full export respecting the current search/filters
    — not just whatever 20 rows happened to be on the current page."""
    domain_subq = _domain_aggregate_subquery(search)
    risk_percent_expr, trust_score_expr = _risk_and_trust_exprs(domain_subq)

    mx_status_expr = case(
        (Domain.mx_records.is_(None), "Unknown"),
        (func.json_length(Domain.mx_records) == 0, "No MX"),
        else_="Valid",
    )

    filter_conditions = _build_domains_query(
        domain_subq, risk_percent_expr, trust_score_expr, None, None, None, mx_status_expr,
        risk_filter, mx_status, flags, min_emails,
    )

    stmt = (
        select(
            domain_subq.c.domain,
            domain_subq.c.total_emails,
            domain_subq.c.safe_count,
            domain_subq.c.risky_count,
            domain_subq.c.unsafe_count,
            domain_subq.c.disposable_count,
            domain_subq.c.role_based_count,
            domain_subq.c.catch_all_count,
            domain_subq.c.first_seen,
            risk_percent_expr.label("risk_percent"),
            trust_score_expr.label("trust_score"),
            mx_status_expr.label("mx_status"),
        )
        .select_from(domain_subq)
        .outerjoin(Domain, Domain.domain == domain_subq.c.domain)
    )
    if filter_conditions:
        stmt = stmt.where(and_(*filter_conditions))

    rows = (await db.execute(stmt.order_by(domain_subq.c.domain.asc()).limit(200_000))).all()

    df = pd.DataFrame(
        [
            {
                "domain": r.domain,
                "verdict": _verdict(r.total_emails, r.risk_percent),
                "total_emails": r.total_emails,
                "safe_count": r.safe_count,
                "risky_count": r.risky_count,
                "unsafe_count": r.unsafe_count,
                "disposable_count": r.disposable_count or 0,
                "role_based_count": r.role_based_count or 0,
                "catch_all_count": r.catch_all_count or 0,
                "risk_percent": round(r.risk_percent, 1),
                "trust_score": round(r.trust_score),
                "mx_status": r.mx_status,
                "first_seen": str(r.first_seen) if r.first_seen else "",
            }
            for r in rows
        ]
    )

    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=domains-export.csv"},
    )


@router.post("/domains/delete")
async def bulk_delete_domains(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
):
    """FIX (audit #3): "Delete Selected" on the Domains page previously called
    an empty function — no API existed. Domains are aggregated LIVE from the
    Email table (see module docstring further up: Domain rows are only ever
    touched for mx_records caching), so "deleting a domain" means deleting
    every Email row under it, plus its Domain cache row if present."""
    domains = payload.get("domains") or []
    if not isinstance(domains, list) or not domains:
        raise HTTPException(status_code=400, detail="Provide a non-empty 'domains' list")

    domains = [d for d in domains if isinstance(d, str) and d.strip()]
    if not domains:
        raise HTTPException(status_code=400, detail="No valid domain names provided")

    email_result = await db.execute(delete(Email).where(Email.domain.in_(domains)))
    await db.execute(delete(Domain).where(Domain.domain.in_(domains)))
    await db.commit()

    return {
        "message": "deleted",
        "domains": domains,
        "emails_deleted": email_result.rowcount,
    }


@router.delete("/emails/{email}")
async def delete_email(
    email: str,
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(select(Email).where(Email.email == email))).scalar_one_or_none()

    if not existing:
        raise HTTPException(status_code=404, detail="Email not found")

    await db.delete(existing)
    await db.commit()
    return {"message": "deleted", "email": email}
