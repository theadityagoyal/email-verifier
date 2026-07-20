/**
 * Mirror of backend/api/v1/endpoints/dashboard.py's bucket_case() logic.
 *
 * Backend logic (source of truth):
 *   CASE
 *     WHEN Email.disposable IS TRUE         -> 'unsafe'
 *     WHEN Email.status IN (SAFE_STATUSES) AND (role_based OR catch_all) -> 'risky'
 *     WHEN Email.status IN (SAFE_STATUSES)  -> 'safe'
 *     WHEN Email.status IN (RISKY_STATUSES) -> 'risky'
 *     WHEN Email.status IN (UNSAFE_STATUSES) -> 'unsafe'
 *     WHEN Email.status = 'processing'       -> 'processing'
 *     ELSE 'unsafe'
 *
 * SAFE_STATUSES:   verified, deliverable, trusted, probably_valid
 * RISKY_STATUSES:  risky, unconfirmed, uncertain
 * UNSAFE_STATUSES: invalid, undeliverable
 *
 * This function MUST stay in sync with the backend. If you change the
 * backend threshold, update this file too.
 */
const SAFE_STATUSES = new Set([
  'verified', 'deliverable', 'trusted', 'probably_valid'
]);

const RISKY_STATUSES = new Set([
  'risky', 'unconfirmed', 'uncertain'
]);

const UNSAFE_STATUSES = new Set([
  'invalid', 'undeliverable'
]);

/**
 * Determine the display bucket for an email, matching backend's bucket_case().
 *
 * @param {Object} email - Email object with status, disposable, role_based, catch_all
 * @returns {'safe'|'risky'|'unsafe'|'processing'} - The bucket for UI rendering
 */
export function getStatusBucket({ status, disposable, role_based, catch_all }) {
  const statusLower = (status || '').toLowerCase();

  // Disposable is always unsafe (highest priority)
  if (disposable === true) {
    return 'unsafe';
  }

  // Safe status but role_based or catch_all -> reclassify as risky
  if (SAFE_STATUSES.has(statusLower) && (role_based === true || catch_all === true)) {
    return 'risky';
  }

  // Safe status
  if (SAFE_STATUSES.has(statusLower)) {
    return 'safe';
  }

  // Risky/uncertain status
  if (RISKY_STATUSES.has(statusLower)) {
    return 'risky';
  }

  // Unsafe status
  if (UNSAFE_STATUSES.has(statusLower)) {
    return 'unsafe';
  }

  // Processing
  if (statusLower === 'processing') {
    return 'processing';
  }

  // Any other status is treated as unsafe (matching backend's else)
  return 'unsafe';
}

/**
 * Get the display label for a bucket (for StatusBadge).
 */
export function getBucketLabel(bucket) {
  const labels = {
    safe: 'Safe',
    risky: 'Risky',
    unsafe: 'Unsafe',
    processing: 'Processing',
    cancelled: 'Cancelled',
    unknown: 'Unknown',
  };
  return labels[bucket] || 'Unknown';
}

/**
 * Get the icon component for a bucket.
 */
export function getBucketIcon(bucket) {
  // Returns icon NAME as string - actual component mapping done in StatusBadge
  const icons = {
    safe: 'CheckCircle2',
    risky: 'AlertTriangle',
    unsafe: 'XCircle',
    processing: 'Loader2',
    cancelled: 'Ban',
    unknown: 'HelpCircle',
  };
  return icons[bucket] || 'HelpCircle';
}