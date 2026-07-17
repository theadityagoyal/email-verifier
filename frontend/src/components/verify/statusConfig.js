/**
 * Centralized status mapping for the Verify Email page.
 *
 * IMPORTANT: This is the ONLY place that decides what status a check
 * shows. UI components never inspect raw backend booleans directly —
 * they call resolveCheckStatus() and render whatever it returns. This
 * means when the backend eventually adds a real "reason" signal (e.g.
 * smtp_reason / smtp_code), we only ever need to touch this one file to
 * introduce a new "Couldn't Verify" status — no component changes needed.
 *
 * Current backend response only has plain booleans (syntax_valid,
 * domain_exists, mx_found, smtp_valid, disposable, role_based, catch_all)
 * with no reason/code field, so we intentionally do NOT expose a
 * "Couldn't Verify" state yet — every check is only ever Verified, Issue
 * Found, or Not Applicable, based strictly on what the backend actually
 * returned.
 *
 * "Not Applicable" is only used when we can prove — from the backend's
 * own control flow, not domain-name guessing — that a downstream check
 * was skipped because a prerequisite failed. This mirrors the actual
 * skip logic in backend/services/email_service.py:
 *   - syntax fails            -> everything downstream skipped
 *   - domain doesn't exist    -> MX lookup skipped
 *   - MX not found            -> SMTP + catch-all skipped
 *   - disposable domain       -> SMTP + catch-all skipped
 *
 * KNOWN LIMITATION (intentionally not hidden): for "trusted" domains,
 * the backend also skips the real SMTP probe (fast path) but leaves
 * smtp_valid/catch_all as their default `false` — which looks identical
 * to a genuine SMTP failure in the response. We cannot tell these two
 * cases apart without a backend-provided reason, so today both render as
 * "Issue Found". This will be resolved the moment the backend exposes a
 * reason/code field — only this file will need to change.
 */
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  AtSign,
  Globe,
  Mail,
  Server,
  Trash2,
  UserCog,
  Target,
} from 'lucide-react';

// ── Status definitions (the "what does this state mean" layer) ─────────────
export const STATUS = Object.freeze({
  VERIFIED: {
    status: 'verified',
    label: 'Verified',
    color: 'success',
    icon: CheckCircle2,
    summary: 'Everything looks good.',
  },
  ISSUE: {
    status: 'issue',
    label: 'Issue Found',
    color: 'error',
    icon: XCircle,
    summary: 'This may affect deliverability.',
  },
  NOT_APPLICABLE: {
    status: 'not_applicable',
    label: 'Not Applicable',
    color: 'neutral',
    icon: MinusCircle,
    summary: 'This check was skipped.',
  },
  // Reserved for when the backend exposes a reason/code field. Not used
  // anywhere yet — kept here so adding it later is a one-line change.
  COULDNT_VERIFY: {
    status: 'couldnt_verify',
    label: "Couldn't Verify",
    color: 'warning',
    icon: MinusCircle,
    summary: "We couldn't confirm this with the mail server.",
  },
});

// ── Per-check metadata: display title, icon, order ──────────────────────────
export const CHECK_DEFS = [
  { key: 'syntax', title: 'Syntax', icon: AtSign, field: 'syntax_valid' },
  { key: 'domain', title: 'Domain', icon: Globe, field: 'domain_exists' },
  { key: 'mx', title: 'MX Records', icon: Mail, field: 'mx_found' },
  { key: 'smtp', title: 'SMTP', icon: Server, field: 'smtp_valid' },
  { key: 'disposable', title: 'Disposable', icon: Trash2, field: 'disposable', inverted: true },
  { key: 'role_based', title: 'Role-based', icon: UserCog, field: 'role_based', inverted: true },
  { key: 'catch_all', title: 'Catch-All', icon: Target, field: 'catch_all', inverted: true },
];

// ── Per-check, per-status descriptions shown to the user ───────────────────
const DESCRIPTIONS = {
  syntax: {
    verified: 'The email format follows standard rules.',
    issue: "The email format doesn't follow standard rules (e.g. missing @, invalid characters).",
  },
  domain: {
    verified: 'The domain exists and has valid DNS records.',
    issue: "The domain doesn't appear to exist.",
    not_applicable: "Skipped because the email format was invalid.",
  },
  mx: {
    verified: 'The domain has mail servers configured to receive email.',
    issue: 'No mail servers were found for this domain — it likely cannot receive email.',
    not_applicable: 'Skipped because the domain check did not pass.',
  },
  smtp: {
    verified: 'The mail server accepted the address during a live check.',
    issue: 'The mail server did not accept this address during a live check.',
    not_applicable: 'Skipped — no mail server was available to check against.',
  },
  disposable: {
    verified: 'Not a temporary or throwaway email provider.',
    issue: 'This is a temporary/disposable email provider — these addresses are often short-lived.',
    not_applicable: 'Skipped because the email format was invalid.',
  },
  role_based: {
    verified: 'This looks like a personal mailbox, not a shared inbox.',
    issue: 'This looks like a shared/generic inbox (e.g. admin@, support@) rather than a personal address.',
    not_applicable: 'Skipped because the email format was invalid.',
  },
  catch_all: {
    verified: 'This domain does not accept every possible address blindly.',
    issue: 'This domain accepts mail for any address, even ones that may not really exist — reduces confidence in this specific address.',
    not_applicable: 'Skipped — no mail server was available to check against.',
  },
};

/**
 * The single source of truth for a check's displayed status.
 *
 * @param {string} checkKey - one of CHECK_DEFS[].key
 * @param {object} result - the full email verification response
 * @returns {{key, title, icon, status, label, color, statusIcon, description, summary}}
 */
export function resolveCheckStatus(checkKey, result) {
  const def = CHECK_DEFS.find((d) => d.key === checkKey);
  if (!def || !result) {
    return null;
  }

  const na = () => ({ ...STATUS.NOT_APPLICABLE, description: DESCRIPTIONS[checkKey]?.not_applicable });
  const pass = () => ({ ...STATUS.VERIFIED, description: DESCRIPTIONS[checkKey]?.verified });
  const fail = () => ({ ...STATUS.ISSUE, description: DESCRIPTIONS[checkKey]?.issue });

  let resolved;

  switch (checkKey) {
    case 'syntax':
      resolved = result.syntax_valid ? pass() : fail();
      break;
    case 'domain':
      resolved = !result.syntax_valid ? na() : result.domain_exists ? pass() : fail();
      break;
    case 'mx':
      resolved = !result.syntax_valid || !result.domain_exists ? na() : result.mx_found ? pass() : fail();
      break;
    case 'smtp':
      resolved =
        !result.syntax_valid || !result.mx_found || result.disposable
          ? na()
          : result.smtp_valid
          ? pass()
          : fail();
      break;
    case 'disposable':
      resolved = !result.syntax_valid ? na() : result.disposable ? fail() : pass();
      break;
    case 'role_based':
      resolved = !result.syntax_valid ? na() : result.role_based ? fail() : pass();
      break;
    case 'catch_all':
      resolved =
        !result.syntax_valid || !result.mx_found || result.disposable
          ? na()
          : result.catch_all
          ? fail()
          : pass();
      break;
    default:
      resolved = na();
  }

  return {
    key: def.key,
    title: def.title,
    icon: def.icon,
    statusIcon: resolved.icon,
    status: resolved.status,
    label: resolved.label,
    color: resolved.color,
    description: resolved.description || resolved.summary,
  };
}

/** Resolve every check for a result at once, in display order. */
export function resolveAllChecks(result) {
  return CHECK_DEFS.map((def) => resolveCheckStatus(def.key, result));
}

// ── Colour class helpers (literal strings — safe for Tailwind's scanner) ────
export const STATUS_COLOR_CLASSES = {
  success: {
    text: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/30',
    ring: 'ring-success/20',
  },
  error: {
    text: 'text-error',
    bg: 'bg-error/10',
    border: 'border-error/30',
    ring: 'ring-error/20',
  },
  warning: {
    text: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    ring: 'ring-warning/20',
  },
  neutral: {
    text: 'text-[var(--foreground)]/40',
    bg: 'bg-[var(--muted)]/50',
    border: 'border-[var(--muted)]',
    ring: 'ring-[var(--muted)]',
  },
};

/**
 * Overall recommendation banding, derived purely from the numeric score
 * the backend already returns — same thresholds already used elsewhere
 * in this app (see utils/scoreThresholds.js: SAFE_MIN=80, RISKY_MIN=60),
 * so the Verify page stays consistent with the Email List / Domains pages.
 */
export function resolveRecommendation(score) {
  if (score >= 80) {
    return {
      label: 'Safe to Send',
      description: 'This email looks good and is safe to use.',
      color: 'success',
      confidence: 'High',
      risk: 'Low',
    };
  }
  if (score >= 60) {
    return {
      label: 'Use with Caution',
      description: 'This email has some risk factors — review before relying on it.',
      color: 'warning',
      confidence: 'Medium',
      risk: 'Medium',
    };
  }
  return {
    label: 'Not Recommended',
    description: 'This email has significant issues and is unlikely to be deliverable.',
    color: 'error',
    confidence: 'Low',
    risk: 'High',
  };
}

/**
 * Builds the "X of Y checks passed" reason line + list of any issues,
 * purely from resolved check statuses — no invented reasons.
 */
export function buildScoreReason(resolvedChecks) {
  const applicable = resolvedChecks.filter((c) => c.status !== 'not_applicable');
  const verified = applicable.filter((c) => c.status === 'verified');
  const issues = applicable.filter((c) => c.status === 'issue');
  const naCount = resolvedChecks.length - applicable.length;

  let text = `${verified.length} of ${applicable.length} applicable check${applicable.length === 1 ? '' : 's'} passed.`;
  if (naCount > 0) {
    text += ` ${naCount} check${naCount === 1 ? '' : 's'} not applicable.`;
  }

  return {
    text,
    issues: issues.map((c) => c.title),
    verifiedCount: verified.length,
    applicableCount: applicable.length,
    issueCount: issues.length,
    naCount,
  };
}
