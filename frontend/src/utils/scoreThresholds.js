// Single source of truth for score/risk tier boundaries used across the
// frontend (EmailListPage, StatusBadge, VerifyEmailPage, DomainTable).
// Mirrors backend/api/v1/endpoints/dashboard.py's RISK_HEALTHY_MAX /
// RISK_WATCH_MAX constants for the domain risk bands. If those backend
// values ever change, update them here too — see dashboard.py comments.

// Email quality score bands (0-100)
export const SCORE_THRESHOLDS = {
  SAFE_MIN: 80,   // score >= 80 -> "Safe" / success color
  RISKY_MIN: 60,  // score >= 60 -> "Risky" / warning color
  // below RISKY_MIN -> "Unsafe" / error color
};

// Domain risk_percent bands (0-100), matches backend RISK_HEALTHY_MAX / RISK_WATCH_MAX
export const RISK_THRESHOLDS = {
  HEALTHY_MAX: 10, // risk_percent < 10 -> Healthy / green
  WATCH_MAX: 30,   // risk_percent < 30 -> Watch / amber, else High Risk / red
};

export function scoreColorClass(score) {
  if (score === null || score === undefined) {
    return 'text-[var(--foreground)]/40 bg-[var(--muted)]/40';
  }
  if (score >= SCORE_THRESHOLDS.SAFE_MIN) {
    return 'text-emerald-700 bg-emerald-100 dark:text-emerald-400 dark:bg-emerald-900/20';
  }
  if (score >= SCORE_THRESHOLDS.RISKY_MIN) {
    return 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/20';
  }
  return 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/20';
}

export function scoreTextColorClass(score) {
  if (score >= SCORE_THRESHOLDS.SAFE_MIN) return 'text-success';
  if (score >= SCORE_THRESHOLDS.RISKY_MIN) return 'text-warning';
  return 'text-error';
}

export function riskBarColorClass(riskPercent) {
  if (riskPercent >= RISK_THRESHOLDS.WATCH_MAX) return 'bg-red-500';
  if (riskPercent >= RISK_THRESHOLDS.HEALTHY_MAX) return 'bg-amber-500';
  return 'bg-emerald-500';
}
