import {
  CircleCheckBig,
  MailCheck,
  ShieldCheck,
  BadgeCheck,
  AlertTriangle,
  HelpCircle,
  ShieldX,
  MailX,
  RefreshCw,
} from 'lucide-react';

const STATUS_CONFIG = {
  // Safe
  verified: {
    icon: CircleCheckBig,
    bucket: 'safe',
    label: 'Safe',
  },
  deliverable: {
    icon: MailCheck,
    bucket: 'safe',
    label: 'Safe',
  },
  trusted: {
    icon: ShieldCheck,
    bucket: 'safe',
    label: 'Safe',
  },
  probably_valid: {
    icon: BadgeCheck,
    bucket: 'safe',
    label: 'Safe',
  },
  safe: {
    icon: ShieldCheck,
    bucket: 'safe',
    label: 'Safe',
  },

  // Risky
  risky: {
    icon: AlertTriangle,
    bucket: 'risky',
    label: 'Risky',
  },
  uncertain: {
    icon: HelpCircle,
    bucket: 'risky',
    label: 'Risky',
  },
  unconfirmed: {
    icon: HelpCircle,
    bucket: 'risky',
    label: 'Risky',
  },

  // Unsafe
  invalid: {
    icon: ShieldX,
    bucket: 'unsafe',
    label: 'Unsafe',
  },
  undeliverable: {
    icon: MailX,
    bucket: 'unsafe',
    label: 'Unsafe',
  },
  unsafe: {
    icon: ShieldX,
    bucket: 'unsafe',
    label: 'Unsafe',
  },

  // Processing
  processing: {
    icon: RefreshCw,
    bucket: 'processing',
    label: 'Processing',
  },

  // Unknown
  unknown: {
    icon: HelpCircle,
    bucket: 'unknown',
    label: 'Unknown',
  },
};

const BUCKET_STYLES = {
  safe:
    'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300',

  risky:
    'inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 shadow-sm dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',

  unsafe:
    'inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 shadow-sm dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',

  processing:
    'inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 shadow-sm dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-300',

  unknown:
    'inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-300',
};

export function getStatusBucket(status = 'unknown') {
  return STATUS_CONFIG[status]?.bucket || 'unknown';
}

export function getStatusLabel(status = 'unknown') {
  return STATUS_CONFIG[status]?.label || 'Unknown';
}

export default function StatusBadge({ status = 'unknown', className = '' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;

  const Icon = config.icon;
  const bucket = config.bucket;

  return (
    <span
      className={`${BUCKET_STYLES[bucket]} transition-all duration-200 hover:scale-105 ${className}`}
    >
      <Icon
        className={`h-3.5 w-3.5 ${bucket === 'processing' ? 'animate-spin' : ''
          }`}
      />

      <span>{config.label}</span>
    </span>
  );
}