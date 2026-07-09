import io
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, case, cast, Date, func, Integer, or_, select, text
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

# Domains-page thresholds — kept next to bucket_case() so anyone touching
# risk bands sees the bucket source of truth right above it.
LOW_SAMPLE_THRESHOLD = 5   # total_emails below this -> "Low Sample" verdict
                           # Minimum sample size needed for reliable risk assessment
RISK_HEALTHY_MAX = 10      # risk_percent below this -> "Healthy"
                           # Domains with <10% risky/unsafe emails are considered healthy
RISK_WATCH_MAX = 30        # risk_percent below this -> "Watch", else "High Risk"
                           # Domains with 10-30% risky/unsafe emails need monitoring
NEW_DOMAIN_DAYS = 7        # first_seen within this many days -> is_new
                           # Domains seen within last 7 days are considered new
TREND_WINDOW_DAYS = 7      # size of each comparison window for domain trend
                           # 7-day windows used for trend analysis (current vs previous)
TREND_DELTA_PCT = 2        # minimum pp change to call it up/down instead of stable
                           # Minimum 2 percentage point change to declare trend direction

# ── Status-breakdown card constants ─────────────────────────────────────────
DAY_TREND_HOURS = 24               # "vs yesterday" comparison window
SPEED_WINDOW_MINUTES = 5           # verification speed measured over last N minutes
PROCESSING_TIME_WINDOW_HOURS = 24  # avg processing time computed over last N hours

# FIX (bug: "Avg Check Time: 17860843.9s"):
# created_at is set once, at first insert. verified_at gets OVERWRITTEN every
# time an email is re-verified. So for a re-verified email, (verified_at -
# created_at) is NOT "how long verification took" — it's "how long ago the
# record was first created", which can be days/weeks -> a huge, meaningless
# number. A real single verification pipeline (syntax->DNS->MX->SMTP->score)
# never legitimately takes more than a couple minutes, so we cap the diff
# used in the average to filter out these stale/re-verify outliers.
MAX_REASONABLE_PROCESSING_SECONDS = 300  # 5 minutes — anything above this is treated as a re-verify artifact, not real processing time

DOMAIN_SORT_OPTIONS = {"risk", "total", "trust", "domain", "newest"}
FLAGGED_FILTER_OPTIONS = {"any", "disposable", "role_based", "catch_all"}


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


async def _compute_dashboard_trends(db: AsyncSession):
    """
    24h-vs-previous-24h trend data for the Status Breakdown card.

    Returns:
      per_status_trend: raw count delta per individual status
                         (e.g. {"probably_valid": 12, "unconfirmed": -8, ...})
      bucket_trend_pct: % change in bucket count (safe/risky/unsafe/processing)
                        vs the previous 24h window, e.g. {"safe": 2.4, "risky": -1.1}
      total_trend_pct: % change in total email count vs the previous 24h window
                        (sum across all buckets — powers the "Total Emails" stat
                        card trend arrow on the dashboard)

    Uses the same bucket_case() as the rest of the dashboard, so these numbers
    can never disagree with the main safe/risky/unsafe/processing counts.
    """
    now = datetime.utcnow()
    day_start = now - timedelta(hours=DAY_TREND_HOURS)
    prev_start = now - timedelta(hours=DAY_TREND_HOURS * 2)

    window_expr = case((Email.created_at >= day_start, "recent"), else_="previous")
    bucket_expr = bucket_case()

    # Per-status recent/previous counts
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

    # Per-bucket recent/previous counts
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
            # No baseline yesterday: report 100% if anything came in today, else flat 0%
            bucket_trend_pct[b] = 100.0 if recent > 0 else 0.0

    if total_prev > 0:
        total_trend_pct = round(((total_recent - total_prev) / total_prev) * 100, 1)
    else:
        total_trend_pct = 100.0 if total_recent > 0 else 0.0

    return per_status_trend, bucket_trend_pct, total_trend_pct


async def _compute_speed_and_processing_time(db: AsyncSession):
    """
    verification_speed: emails/sec, measured over the last SPEED_WINDOW_MINUTES,
      based on verified_at timestamps (actual throughput, not an estimate).
    avg_processing_time_ms: avg(verified_at - created_at) over the last
      PROCESSING_TIME_WINDOW_HOURS, in milliseconds.

    FIXED: previously this could blow up to absurd values (e.g. "17860843.9s")
    whenever an email got RE-verified — created_at stays at the original
    insert time while verified_at jumps to "now", so the delta ends up being
    "how long the record has existed" instead of "how long verification
    took". We now cap the per-row diff at MAX_REASONABLE_PROCESSING_SECONDS
    (5 min) in the SQL WHERE clause itself, so those stale re-verify rows
    are excluded from the average entirely instead of skewing it.
    """
    now = datetime.utcnow()

    # ── Verification Speed ────────────────────────────────────────────────
    speed_start = now - timedelta(minutes=SPEED_WINDOW_MINUTES)
    speed_count_row = await db.execute(
        select(func.count(Email.id)).where(
            Email.verified_at.isnot(None),
            Email.verified_at >= speed_start
        )
    )
    speed_count = speed_count_row.scalar() or 0
    verification_speed = round(speed_count / (SPEED_WINDOW_MINUTES * 60), 1)

    # ── Average Processing Time (in SECONDS) ─────────────────────────────
    proc_start = now - timedelta(hours=PROCESSING_TIME_WINDOW_HOURS)
    diff_expr = func.timestampdiff(text("SECOND"), Email.created_at, Email.verified_at)

    # Get average in SECONDS using the same status categories as defined in constants.
    # diff_expr.between(0, MAX_REASONABLE_PROCESSING_SECONDS) is the actual fix —
    # excludes negative diffs (clock skew) AND re-verify artifacts (huge diffs).
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

    # Convert to milliseconds and ensure it's a reasonable value
    if avg_seconds is not None and avg_seconds > 0:
        # Convert seconds to milliseconds (timestampdiff with SECOND returns seconds)
        avg_processing_time_ms = round(float(avg_seconds) * 1000, 1)
    else:
        # Fallback: check a wider window (still capped — same reasoning as above)
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
            # Convert seconds to milliseconds
            avg_processing_time_ms = round(float(fallback_seconds) * 1000, 1)
        else:
            avg_processing_time_ms = 0.0

    return verification_speed, avg_processing_time_ms


async def _compute_flagged_overview(db: AsyncSession):
    """Powers the Flagged Emails card's Overview row: Total Flagged, High
    Priority (disposable), Flag Rate, and Last 7 Days — each with a trend %
    versus its own comparison window (24h for the first three, 7d-vs-prev-7d
    for the last one)."""
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

    # 24h vs previous 24h — total_flagged, high_priority, flag_rate
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

    # 7d vs previous 7d — last_7_days count
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
    """Powers the Worst Domains card's Summary row: Avg Reputation, High
    Risk count, Total Domains, Improving count — each with a trend %
    versus the previous 7-day window. Reuses the domain_map already built
    in get_dashboard_stats for the current snapshot; only the historical
    baseline requires extra queries."""
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

    # Per-domain 7d-vs-prev-7d trend (same pattern as /domains) -> improving_count
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

    # Previous-period snapshot (data older than 7 days) -> baseline for all 4 trend %s
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

    # NOTE (flagged, not yet fixed — see chat explanation): a fully correct
    # improving_trend_pct needs a genuine "improving count as of last week"
    # baseline (its own 7d-vs-7d comparison shifted back a further 7 days).
    # Left as pct_delta(improving_count, non_improving_count) for now, which
    # is a same-snapshot comparison, NOT a real previous-period trend —
    # do not treat this number as reliable yet.
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
    """Aggregate stats for the dashboard overview — safe/risky/unsafe bucket logic,
    trust score, flagged counts, top domains, daily volume, active job, the 24h
    trend / speed / processing-time metrics used by the Status Breakdown card,
    and the Flagged Emails / Worst Domains card overview rows."""

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

    # 6. Top domains — live per-row aggregation from Email table
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

    # 7. Daily volume — last N days, flat bucket counts per day
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

    # 9. 24h trends (per-status count delta + per-bucket % change + total % change)
    per_status_trend, bucket_trend_pct, total_emails_trend_pct = await _compute_dashboard_trends(db)

    # 10. Live verification speed + avg processing time
    verification_speed, avg_processing_time_ms = await _compute_speed_and_processing_time(db)

    # 11. Flagged Emails overview + Worst Domains summary
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
        # FIX: timezone-aware UTC instant, not a naive datetime.utcnow().
        # Naive datetimes serialize without a 'Z'/offset, so the frontend's
        # `new Date(isoString)` was interpreting this as LOCAL browser time
        # instead of UTC — on an IST browser that manufactured a fake ~5.5hr
        # gap, which is exactly the "Last updated / Last Sync 5 hr ago" bug
        # even though the dashboard refetches every 3 seconds.
        generated_at=datetime.now(timezone.utc),
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
    score_min: int | None = Query(default=None, ge=0, le=100),
    score_max: int | None = Query(default=None, ge=0, le=100),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    flagged: str | None = Query(default=None),
    order: str = Query(default="asc"),   # ← NEW LINE
    db: AsyncSession = Depends(get_db),
):
    """Paginated, searchable, filterable email list.

    `status` accepts EITHER a bucket name (safe/risky/unsafe/processing —
    filtered via the same bucket_case() the dashboard/domains pages use, so
    disposable/role_based/catch_all overrides are respected) OR a raw
    EmailStatus value (verified/deliverable/trusted/probably_valid/risky/
    unconfirmed/uncertain/invalid/undeliverable/processing) for callers that
    want a specific granular status.

    `flagged` powers the Dashboard's "Review Now" deep-link
    (/emails?filter=flagged -> flagged=any) as well as the Email List page's
    own Flagged dropdown filter:
      - "any": disposable OR role_based OR catch_all
      - "disposable" / "role_based" / "catch_all": that single flag only
    """
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
    order_col = Email.created_at.desc() if order == "desc" else Email.created_at
    items_result = await db.execute(query.order_by(order_col).offset(offset).limit(size))
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

    mx_map = {}
    if domains_on_page:
        mx_rows = (
            await db.execute(
                select(Domain.domain, Domain.mx_records).where(Domain.domain.in_(domains_on_page))
            )
        ).all()
        mx_map = {d: mx for d, mx in mx_rows}

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
