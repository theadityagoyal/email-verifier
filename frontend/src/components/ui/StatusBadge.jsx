import { CheckCircle2, AlertTriangle, XCircle, Loader2, HelpCircle, Ban } from 'lucide-react';

const STATUS_CONFIG = {
  verified: { label: 'Safe', bucket: 'safe' },
  deliverable: { label: 'Safe', bucket: 'safe' },
  trusted: { label: 'Safe', bucket: 'safe' },
  probably_valid: { label: 'Safe', bucket: 'safe' },
  safe: { label: 'Safe', bucket: 'safe' },

  risky: { label: 'Risky', bucket: 'risky' },
  uncertain: { label: 'Risky', bucket: 'risky' },
  unconfirmed: { label: 'Risky', bucket: 'risky' },

  invalid: { label: 'Unsafe', bucket: 'unsafe' },
  undeliverable: { label: 'Unsafe', bucket: 'unsafe' },
  unsafe: { label: 'Unsafe', bucket: 'unsafe' },

  processing: { label: 'Processing', bucket: 'processing' },

  // Cancelled (bulk jobs only — a job that was stopped via
  // POST /jobs/{job_id}/cancel before it finished)
  cancelled: { label: 'Cancelled', bucket: 'cancelled' },

  unknown: { label: 'Unknown', bucket: 'unknown' },
};

// Fully literal class strings — safe under Tailwind's production content-scanning/purge.
const BUCKET_CLASSES = {
  safe: 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 border-emerald-200 dark:border-emerald-400/20',
  risky: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/20',
  unsafe: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20',
  processing: 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/20',
  cancelled: 'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-400/10 border-slate-300 dark:border-slate-400/20',
  unknown: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-400/10 border-slate-200 dark:border-slate-400/20',
};

const BUCKET_ICONS = {
  safe: CheckCircle2,
  risky: AlertTriangle,
  unsafe: XCircle,
  processing: Loader2,
  cancelled: Ban,
  unknown: HelpCircle,
};

export default function StatusBadge({ status = 'unknown', className = '', showIcon = true }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const colorClass = BUCKET_CLASSES[config.bucket] || BUCKET_CLASSES.unknown;
  const Icon = BUCKET_ICONS[config.bucket] || HelpCircle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${colorClass} ${className}`}
    >
      {showIcon && (
        <Icon className={`h-3 w-3 ${config.bucket === 'processing' ? 'animate-spin' : ''}`} aria-hidden="true" />
      )}
      <span>{config.label}</span>
    </span>
  );
}

export function getStatusBucket(status) {
  const statusLower = (status || '').toLowerCase();
  const config = STATUS_CONFIG[statusLower];
  return config ? config.bucket : 'unknown';
}
