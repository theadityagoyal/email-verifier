/**
 * Single source of truth for "why is this email safe/risky/unsafe" —
 * shared between EmailListPage (short reason + hover tooltip) and the
 * Verify Email page (full reason via WhyThisScore/statusConfig).
 *
 * SUB_STATUS_LABELS lives here (moved from components/verify/statusConfig.js)
 * so both pages read from the exact same object — statusConfig.js re-exports
 * it for backward compat with existing imports (getSubStatusInfo etc.).
 *
 * getVerificationReason(email) works off the SAME field shape returned by
 * every /emails and /verify-email response (syntax_valid, domain_exists,
 * mx_found, smtp_valid, disposable, role_based, catch_all, sub_status).
 * No backend changes needed — sub_status/confidence/reason_code are already
 * computed server-side (backend/validators/score_calculator.py) and already
 * flow through EmailVerifyResponse into the /emails list.
 */

// ── Sub-status label/color mapping (moved from statusConfig.js) ────────────
// Maps backend sub_status strings to display labels and colors.
export const SUB_STATUS_LABELS = Object.freeze({
  mailbox_confirmed: { label: 'Mailbox Confirmed', color: 'success', summary: 'The mail server confirmed this address exists.' },
  smtp_skipped_trusted: { label: 'Trusted Domain (Legacy — Not Re-verified)', color: 'success', summary: 'Historical record from before SMTP verification was required for trusted domains.' },
  smtp_ambiguous_trusted: { label: 'Trusted Domain — Inconclusive', color: 'warning', summary: 'Trusted provider; SMTP timed out or deferred — cannot confirm but not rejected.' },
  catch_all_masked: { label: 'Catch-All Domain', color: 'warning', summary: 'Domain accepts all addresses — cannot confirm this specific mailbox.' },
  greylisted_unconfirmed: { label: 'Greylisted', color: 'warning', summary: 'Mail server temporarily deferred — try again later.' },
  dns_timeout_assumed: { label: 'DNS Timeout', color: 'warning', summary: 'DNS lookup timed out — result assumed valid for scoring.' },
  syntax_invalid: { label: 'Invalid Syntax', color: 'error', summary: 'Email format is invalid.' },
  domain_not_found: { label: 'Domain Not Found', color: 'error', summary: 'Domain does not exist in DNS.' },
  no_mx_records: { label: 'No MX Records', color: 'error', summary: 'Domain has no mail servers configured.' },
  disposable_domain: { label: 'Disposable Domain', color: 'error', summary: 'Known temporary/throwaway email provider.' },
  role_based_address: { label: 'Role-Based Address', color: 'warning', summary: 'Generic inbox (admin@, support@, etc.) — not a personal mailbox.' },
  smtp_rejected: { label: 'SMTP Rejected', color: 'error', summary: 'Mail server rejected the address (mailbox not found).' },
  smtp_blocked: { label: 'Blocked by Server', color: 'error', summary: 'Server indicated address is blocked or blacklisted.' },
  smtp_rate_limited: { label: 'Rate Limited', color: 'warning', summary: 'Too many connection attempts — server temporarily unavailable.' },
  smtp_temp_failure: { label: 'Temporary Failure', color: 'warning', summary: 'Server returned a temporary error — may succeed if retried.' },
  unknown_error: { label: 'Unknown Error', color: 'error', summary: 'An unexpected error occurred during verification.' },
});

// ── Fallback reason chain (used only when sub_status is missing — e.g. old
// rows written before sub_status existed, or rows served from a cached
// reuse path that didn't recompute it). Order = priority: first match wins,
// same order the backend's own determine_sub_status() checks in. ──────────
const FALLBACK_CHAIN = [
  { test: (e) => !e.syntax_valid, reason: 'Invalid email syntax.' },
  { test: (e) => !e.domain_exists, reason: 'Domain does not exist.' },
  { test: (e) => !e.mx_found, reason: 'No MX records found.' },
  { test: (e) => e.disposable, reason: 'Disposable email provider detected.' },
  { test: (e) => e.role_based, reason: 'Role-based mailbox.' },
  { test: (e) => e.catch_all, reason: 'Catch-all domain detected.' },
  { test: (e) => !e.smtp_valid, reason: 'SMTP verification failed.' },
  { test: () => true, reason: 'All verification checks passed.' },
];

/**
 * Returns { shortReason, fullReason, priority } for a given email record.
 *
 * @param {object} email - an email object shaped like EmailVerifyResponse
 *   (must have syntax_valid, domain_exists, mx_found, smtp_valid,
 *   disposable, role_based, catch_all; sub_status is optional).
 */
export function getVerificationReason(email) {
  if (!email) {
    return { shortReason: 'Unknown', fullReason: 'No verification data available.', priority: 99 };
  }

  // Preferred path: backend already computed sub_status — use it directly,
  // it's the single most authoritative signal (same one Verify page uses).
  if (email.sub_status && SUB_STATUS_LABELS[email.sub_status]) {
    const info = SUB_STATUS_LABELS[email.sub_status];
    return {
      shortReason: info.label,
      fullReason: info.summary ? `${info.label}: ${info.summary}` : info.label,
      priority: info.color === 'error' ? 1 : info.color === 'warning' ? 2 : 3,
    };
  }

  // Fallback: sub_status missing — derive from raw booleans, same priority
  // order as the backend's own check chain. First match wins.
  const idx = FALLBACK_CHAIN.findIndex((rule) => rule.test(email));
  const matched = FALLBACK_CHAIN[Math.max(idx, 0)];
  const isAllPassed = matched.reason === 'All verification checks passed.';

  return {
    shortReason: matched.reason,
    fullReason: matched.reason,
    priority: isAllPassed ? 3 : idx + 1,
  };
}
