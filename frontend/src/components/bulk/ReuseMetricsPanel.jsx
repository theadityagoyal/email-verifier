import { Zap, ArrowDownLeft, ArrowDownRight, MinusSquare, RefreshCw, ShieldCheck, Globe, Mail } from 'lucide-react';

/**
 * ReuseStatItem - A single icon + number + label column used inside the
 * Smart Verification Reuse panel (Reused Results / Freshly Verified / DNS
 * Checks Saved / SMTP Checks Saved).
 */
function ReuseStatItem({ icon: Icon, value, label, colorClass, bgClass }) {
  return (
    <div className="flex flex-col items-center text-center gap-2">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bgClass}`}>
        <Icon className={`h-5 w-5 ${colorClass}`} aria-hidden="true" />
      </div>
      <p className="text-2xl font-bold tabular-nums text-[var(--foreground)]">{value.toLocaleString()}</p>
      <p className="text-xs text-[var(--foreground)]/50">{label}</p>
    </div>
  );
}

/**
 * ReuseMetricsPanel - Displays smart verification reuse metrics for completed bulk jobs.
 * Only renders for 'completed' status jobs (numbers are meaningless during processing).
 */
export default function ReuseMetricsPanel({ job }) {
  if (job.status !== 'completed') return null;

  const {
    cache_hit_rate = 0,
    reused_results = 0,
    newly_verified = 0,
    dns_checks_saved = 0,
    smtp_checks_saved = 0,
    duplicate_emails_removed = 0,
    unique_emails = 0,
    total_emails_seen = 0,
  } = job;

  // Only show if there's meaningful data to display
  const hasReuseData = reused_results > 0 || newly_verified > 0 || dns_checks_saved > 0 || smtp_checks_saved > 0 || duplicate_emails_removed > 0;

  if (!hasReuseData) return null;

  return (
    <div className="px-4 pb-4 mt-4">
      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        Smart Verification Reuse
      </h4>

      <div className="rounded-xl border border-[var(--muted)] bg-[var(--muted)]/20 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          {/* Cache Hit Rate */}
          <div className="lg:w-52 shrink-0 flex flex-col gap-2">
            <span className="text-sm text-[var(--foreground)]/60">Cache Hit Rate</span>
            <span className="inline-flex w-fit items-center px-3 py-1 rounded-full text-sm font-semibold tabular-nums bg-success/15 text-success border border-success/30">
              {typeof cache_hit_rate === 'number' ? cache_hit_rate.toFixed(1) : cache_hit_rate}% ({reused_results} of {unique_emails || job.total})
            </span>
            <span className="text-xs text-[var(--foreground)]/40">DNS/SMTP checks skipped via TTL cache</span>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px self-stretch bg-[var(--muted)]" />

          {/* Icon stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 flex-1">
            <ReuseStatItem
              icon={RefreshCw}
              value={reused_results}
              label="Reused Results"
              colorClass="text-primary"
              bgClass="bg-primary/10"
            />
            <ReuseStatItem
              icon={ShieldCheck}
              value={newly_verified}
              label="Freshly Verified"
              colorClass="text-success"
              bgClass="bg-success/10"
            />
            <ReuseStatItem
              icon={Globe}
              value={dns_checks_saved}
              label="DNS Checks Saved"
              colorClass="text-info"
              bgClass="bg-info/10"
            />
            <ReuseStatItem
              icon={Mail}
              value={smtp_checks_saved}
              label="SMTP Checks Saved"
              colorClass="text-warning"
              bgClass="bg-warning/10"
            />
          </div>
        </div>

        {/* Duplicates Removed (only show if > 0) */}
        {duplicate_emails_removed > 0 && (
          <div className="flex items-center gap-3 mt-5 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <MinusSquare className="h-5 w-5 text-warning shrink-0" />
            <div>
              <p className="text-sm font-medium text-warning">Duplicate emails removed</p>
              <p className="text-sm text-[var(--foreground)]/70">
                {duplicate_emails_removed.toLocaleString()} duplicate {duplicate_emails_removed === 1 ? 'row' : 'rows'} removed from upload
                {total_emails_seen > 0 && ` (${total_emails_seen.toLocaleString()} total rows in file)`}
              </p>
            </div>
          </div>
        )}

        {/* Summary row when we have total_emails_seen */}
        {total_emails_seen > 0 && unique_emails > 0 && (
          <div className="flex items-center gap-4 text-xs text-[var(--foreground)]/50 pt-4 mt-4 border-t border-[var(--muted)]">
            <span className="flex items-center gap-1">
              <ArrowDownLeft className="h-3 w-3" /> {unique_emails.toLocaleString()} unique emails processed
            </span>
            <span className="flex items-center gap-1">
              <ArrowDownRight className="h-3 w-3" /> {total_emails_seen.toLocaleString()} total rows in file
            </span>
          </div>
        )}
      </div>
    </div>
  );
}