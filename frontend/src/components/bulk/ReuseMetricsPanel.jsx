import { CheckSquare, Zap, ArrowDownLeft, ArrowDownRight, MinusSquare } from 'lucide-react';
import { StatTile } from './JobCard';

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
    <div className="px-4 pb-4 border-t border-[var(--muted)] mt-4">
      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3 flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        Smart Verification Reuse
      </h4>

      <div className="space-y-3">
        {/* Cache Hit Rate Badge */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--foreground)]/60 w-40 shrink-0">Cache Hit Rate</span>
          <div className="flex-1 flex items-center gap-3">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium tabular-nums ${
              cache_hit_rate > 50
                ? 'bg-success/15 text-success border border-success/30'
                : 'bg-warning/15 text-warning border border-warning/30'
            }`}>
              {typeof cache_hit_rate === 'number' ? cache_hit_rate.toFixed(1) : cache_hit_rate}% ({reused_results} of {unique_emails || job.total})
            </span>
            <span className="text-xs text-[var(--foreground)]/40">DNS/SMTP checks skipped via TTL cache</span>
          </div>
        </div>

        {/* Reused vs Freshly Verified Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatTile
            label="Reused Results"
            value={reused_results}
            colorClass="text-primary"
          />
          <StatTile
            label="Freshly Verified"
            value={newly_verified}
            colorClass="text-success"
          />
        </div>

        {/* DNS/SMTP Checks Saved */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <StatTile
            label="DNS Checks Saved"
            value={dns_checks_saved}
            colorClass="text-[var(--accent)]"
          />
          <StatTile
            label="SMTP Checks Saved"
            value={smtp_checks_saved}
            colorClass="text-success"
          />
        </div>

        {/* Duplicates Removed (only show if > 0) */}
        {duplicate_emails_removed > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
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
          <div className="flex items-center gap-4 text-xs text-[var(--foreground)]/50 pt-2 border-t border-[var(--muted)]">
            <span>
              <ArrowDownLeft className="h-3 w-3 inline-block mr-1" /> {unique_emails.toLocaleString()} unique emails processed
            </span>
            <span>
              <ArrowDownRight className="h-3 w-3 inline-block mr-1" /> {total_emails_seen.toLocaleString()} total rows in file
            </span>
          </div>
        )}
      </div>
    </div>
  );
}