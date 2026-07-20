import { CheckCircle2, AlertTriangle, XCircle, Loader2, HelpCircle, Ban } from 'lucide-react';
import { getStatusBucket, getBucketLabel, getBucketIcon } from '@/utils/statusBucket';

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

export default function StatusBadge({
  status = 'unknown',
  className = '',
  showIcon = true,
  // Optional full email object - if provided, uses backend bucket_case logic
  email = null,
  // Or pass flags directly for backward compat
  disposable = false,
  role_based = false,
  catch_all = false,
}) {
  // If email object is provided, extract status and flags from it
  // Otherwise use individual props (for backward compat)
  const statusFromEmail = email ? email.status : status;
  const flags = email ? {
    disposable: email.disposable,
    role_based: email.role_based,
    catch_all: email.catch_all,
  } : { disposable, role_based, catch_all };

  const bucket = getStatusBucket({ status: statusFromEmail, ...flags });
  const label = getBucketLabel(bucket);
  const colorClass = BUCKET_CLASSES[bucket] || BUCKET_CLASSES.unknown;
  const Icon = BUCKET_ICONS[bucket] || HelpCircle;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${colorClass} ${className}`}
    >
      {showIcon && (
        <Icon className={`h-3 w-3 ${bucket === 'processing' ? 'animate-spin' : ''}`} aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}

export function getStatusBucketFromStatus(status) {
  const statusLower = (status || '').toLowerCase();
  if (['verified', 'deliverable', 'trusted', 'probably_valid'].includes(statusLower)) return 'safe';
  if (['risky', 'unconfirmed', 'uncertain'].includes(statusLower)) return 'risky';
  if (['invalid', 'undeliverable'].includes(statusLower)) return 'unsafe';
  if (statusLower === 'processing') return 'processing';
  if (statusLower === 'cancelled') return 'cancelled';
  return 'unknown';
}