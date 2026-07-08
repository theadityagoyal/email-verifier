import { useTheme } from '@/styles/theme';

export default function StatusBadge({ status = 'unknown', className = '' }) {
  const theme = useTheme();

  const STATUS_CONFIG = {
    // Safe
    verified: {
      label: 'Safe',
      color: 'success',
    },
    deliverable: {
      label: 'Safe',
      color: 'success',
    },
    trusted: {
      label: 'Safe',
      color: 'success',
    },
    probably_valid: {
      label: 'Safe',
      color: 'success',
    },
    safe: {
      label: 'Safe',
      color: 'success',
    },

    // Risky
    risky: {
      label: 'Risky',
      color: 'warning',
    },
    uncertain: {
      label: 'Risky',
      color: 'warning',
    },
    unconfirmed: {
      label: 'Risky',
      color: 'warning',
    },

    // Unsafe
    invalid: {
      label: 'Unsafe',
      color: 'error',
    },
    undeliverable: {
      label: 'Unsafe',
      color: 'error',
    },
    unsafe: {
      label: 'Unsafe',
      color: 'error',
    },

    // Processing
    processing: {
      label: 'Processing',
      color: 'info',
    },

    // Unknown
    unknown: {
      label: 'Unknown',
      color: 'muted',
    },
  };

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unknown;
  const colorClass = `text-${config.color}-600 dark:text:${config.color}-400 bg-${config.color}-50 dark:bg-${config.color}-900/20`;

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-[var(--muted)] px-3 py-1 text-xs font-semibold ${colorClass} ${className}`}
    >
      {/* Icons would go here if needed */}
      <span>{config.label}</span>
    </span>
  );
}

// Helper function to get the bucket/category for a status
export function getStatusBucket(status) {
  const statusLower = (status || '').toLowerCase();

  const safeStatuses = ['verified', 'deliverable', 'trusted', 'probably_valid', 'safe'];
  const riskyStatuses = ['risky', 'uncertain', 'unconfirmed'];
  const unsafeStatuses = ['invalid', 'undeliverable', 'unsafe'];

  if (safeStatuses.includes(statusLower)) {
    return 'safe';
  }
  if (riskyStatuses.includes(statusLower)) {
    return 'risky';
  }
  if (unsafeStatuses.includes(statusLower)) {
    return 'unsafe';
  }
  if (statusLower === 'processing') {
    return 'processing';
  }

  return 'unknown';
}