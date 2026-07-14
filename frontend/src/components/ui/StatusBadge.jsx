// FIX (audit #19): the old dynamic template-string classes had a typo
// (`dark:text:${...}` — colon instead of dash — so dark-mode text color
// silently never applied), and dynamically-built Tailwind class names like
// `text-${color}-600` generally don't survive production CSS purging unless
// the full literal string appears somewhere Tailwind can statically scan.
// Fixed by using a static, fully-literal class map (same pattern StatCard.jsx
// already used correctly).
const STATUS_CONFIG = {
  // Safe
  verified: { label: 'Safe', bucket: 'safe' },
  deliverable: { label: 'Safe', bucket: 'safe' },
  trusted: { label: 'Safe', bucket: 'safe' },
  probably_valid: { label: 'Safe', bucket: 'safe' },
  safe: { label: 'Safe', bucket: 'safe' },

  // Risky
  risky: { label: 'Risky', bucket: 'risky' },
  uncertain: { label: 'Risky', bucket: 'risky' },
  unconfirmed: { label: 'Risky', bucket: 'risky' },

  // Unsafe
  invalid: { label: 'Unsafe', bucket: 'unsafe' },
  undeliverable: { label: 'Unsafe', bucket: 'unsafe' },
  unsafe: { label: 'Unsafe', bucket: 'unsafe' },

  // Processing
  processing: { label: 'Processing', bucket: 'processing' },

  // Unknown
  unknown: { label: 'Unknown', bucket: 'unknown' },
};

// Fully literal class strings per bucket — safe under Tailwind's production
// content-scanning/purge, unlike the previous `text-${color}-600` pattern.
const BUCKET_CLASSES = {
  safe: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
  risky: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20',
  unsafe: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20',
  processing: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
  unknown: 'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/20',
};

export default function StatusBadge({ status = 'unknown', className = '' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const colorClass = BUCKET_CLASSES[config.bucket] || BUCKET_CLASSES.unknown;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-[var(--muted)] px-3 py-1 text-xs font-semibold ${colorClass} ${className}`}
    >
      <span>{config.label}</span>
    </span>
  );
}

// Helper function to get the bucket/category for a status
export function getStatusBucket(status) {
  const statusLower = (status || '').toLowerCase();
  const config = STATUS_CONFIG[statusLower];
  return config ? config.bucket : 'unknown';
}
