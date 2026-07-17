/**
 * Shared date/time formatting utilities for the Email Verifier frontend.
 *
 * CRITICAL: All timestamps from the backend are stored in UTC (naive datetime).
 * This module converts them to IST (Asia/Kolkata) for display in the UI.
 *
 * Do NOT use browser-local timezone formatting for user-facing timestamps.
 * Use the functions in this module exclusively.
 */

const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Parse a UTC ISO string (without 'Z' suffix) as UTC.
 * Backend returns naive UTC datetimes like "2026-07-15T11:47:21" without timezone.
 * We must explicitly parse as UTC to avoid browser interpreting as local time.
 */
function parseUTC(dateString) {
  if (!dateString) return null;
  // Append 'Z' to force UTC parsing, since backend stores naive UTC
  return new Date(dateString + 'Z');
}

/**
 * Format a UTC ISO string date as IST with full date and time.
 * Example: "31 Dec 2024, 02:30:45 PM"
 */
export function formatDateTimeIST(dateString) {
  if (!dateString) return '—';
  return parseUTC(dateString).toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Format a UTC ISO string date as IST with date and time (short).
 * Example: "31 Dec 2024, 02:30 PM"
 */
export function formatDateTimeShortIST(dateString) {
  if (!dateString) return '—';
  return parseUTC(dateString).toLocaleString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a UTC ISO string date as IST date only.
 * Example: "31 Dec 2024"
 */
export function formatDateIST(dateString) {
  if (!dateString) return '—';
  return parseUTC(dateString).toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Format a UTC ISO string date for chart labels (IST).
 * Example: "31 Dec"
 */
export function formatChartLabelIST(dateString) {
  if (!dateString) return '';
  return parseUTC(dateString).toLocaleDateString('en-IN', {
    timeZone: IST_TIMEZONE,
    day: '2-digit',
    month: 'short',
  });
}

/**
 * Get relative time string from UTC ISO string.
 * Example: "2 min ago", "3 hours ago", "5 days ago"
 * Uses browser local time for "now" but parses the input as UTC.
 */
export function relativeTime(dateString) {
  if (!dateString) return '—';
  const then = parseUTC(dateString);
  const diffMs = Date.now() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec} sec ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Format average processing time in human-readable form.
 * Example: "<1ms", "45ms", "1.2s", "2.5s"
 */
export function formatAvgTime(timeMs) {
  if (timeMs === null || timeMs === undefined) return '—';
  if (timeMs === 0) return '<1ms';

  if (timeMs >= 1000) {
    const seconds = timeMs / 1000;
    return `${seconds.toFixed(1)}s`;
  }
  if (timeMs >= 1) {
    return `${Math.round(timeMs)}ms`;
  }
  return '<1ms';
}

/**
 * IST date key for grouping (YYYY-MM-DD in IST).
 * Used for date filtering in BulkUploadPage.
 */
export function istDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE }).format(date);
}

/**
 * IST month key for grouping (YYYY-MM in IST).
 */
export function istMonthKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST_TIMEZONE, year: 'numeric', month: '2-digit' }).format(date);
}

/**
 * NEW — short human duration between two UTC ISO strings, e.g. "45s",
 * "1m 24s", "2h 05m". Used by the redesigned Bulk Upload history cards
 * (JobCard.jsx) to show job duration.
 *
 * If `endDateString` is omitted/null, measures up to "now" — safe to call
 * on every render for an in-progress job since it naturally ticks forward
 * on each poll-triggered re-render, no separate timer needed.
 */
export function formatDurationShort(startDateString, endDateString) {
  if (!startDateString) return '—';
  const start = parseUTC(startDateString);
  const end = endDateString ? parseUTC(endDateString) : new Date();
  let diffSec = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (!Number.isFinite(diffSec) || diffSec < 0) diffSec = 0;

  if (diffSec < 60) return `${diffSec}s`;

  const totalMin = Math.floor(diffSec / 60);
  const sec = diffSec % 60;
  if (totalMin < 60) return `${totalMin}m ${sec}s`;

  const hr = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;
  return `${hr}h ${remMin}m`;
}
