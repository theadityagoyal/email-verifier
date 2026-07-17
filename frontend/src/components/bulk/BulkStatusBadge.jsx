import { Clock, Loader2, CheckCircle2, XCircle, Ban, HelpCircle } from 'lucide-react';

// NOTE: this is intentionally separate from components/ui/StatusBadge.jsx.
// That component's STATUS_CONFIG covers EMAIL verdicts (safe/risky/unsafe/
// processing/cancelled) and has no entry for 'completed', 'pending', or
// 'failed' — the exact JOB statuses used here — so reusing it would have
// silently rendered "Completed" jobs as an "Unknown" gray badge. Keeping
// bulk-job statuses in their own file avoids touching that shared component
// (used across EmailListPage/VerifyEmailPage) just to fix this page.
const CONFIG = {
  pending: {
    label: 'Pending',
    icon: Clock,
    badgeClasses:
      'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/20',
    avatarClasses: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  },
  processing: {
    label: 'Processing',
    icon: Loader2,
    spin: true,
    badgeClasses:
      'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-400/10 border-blue-200 dark:border-blue-400/20',
    avatarClasses: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    badgeClasses:
      'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 border-emerald-200 dark:border-emerald-400/20',
    avatarClasses: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  failed: {
    label: 'Failed',
    icon: XCircle,
    badgeClasses:
      'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20',
    avatarClasses: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    badgeClasses:
      'text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-400/10 border-slate-300 dark:border-slate-400/20',
    avatarClasses: 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
  },
};

const FALLBACK = {
  icon: HelpCircle,
  badgeClasses:
    'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-400/10 border-slate-200 dark:border-slate-400/20',
  avatarClasses: 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
};

export function getBulkStatusMeta(status) {
  return CONFIG[status] || { ...FALLBACK, label: status || 'Unknown' };
}

export default function BulkStatusBadge({ status, size = 'md', className = '' }) {
  const meta = getBulkStatusMeta(status);
  const Icon = meta.icon;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px] gap-1' : 'px-2.5 py-1 text-xs gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${sizeClasses} ${meta.badgeClasses} ${className}`}
    >
      <Icon className={`h-3 w-3 ${meta.spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}
