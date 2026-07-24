/**
 * Shared status/bucket logic — single source of truth fetched from backend.
 *
 * Backend source: backend/api/v1/endpoints/config.py -> GET /api/v1/config/status-mapping
 * (which mirrors dashboard.py's bucket_case() and _verdict() logic exactly)
 *
 * This module:
 * - Exposes sync functions getStatusBucket(), getBucketLabel(), getBucketIcon()
 *   (call-site API unchanged — no Promise returned)
 * - Loads config asynchronously at bootstrap via ensureConfigLoaded()
 * - Falls back to embedded defaults (identical to backend at build time) if fetch fails
 *
 * App startup (src/main.jsx or App.jsx) MUST call:
 *   await import('@/utils/statusBucket').then(m => m.ensureConfigLoaded())
 * before first render that uses these functions.
 */

// ── Embedded defaults (must match backend config.py at build time) ──
const EMBEDDED_DEFAULTS = {
  emailStatusBuckets: {
    safeStatuses: ["verified", "deliverable", "trusted", "probably_valid"],
    riskyStatuses: ["risky", "unconfirmed", "uncertain"],
    unsafeStatuses: ["invalid", "undeliverable"],
    processingStatus: "processing",
    bucketRules: [
      { condition: "disposable", bucket: "unsafe", priority: 1 },
      { condition: "safe_status_and_role_or_catchall", bucket: "risky", priority: 2 },
      { condition: "safe_status", bucket: "safe", priority: 3 },
      { condition: "risky_status", bucket: "risky", priority: 4 },
      { condition: "unsafe_status", bucket: "unsafe", priority: 5 },
      { condition: "processing", bucket: "processing", priority: 6 },
      { condition: "default", bucket: "unsafe", priority: 7 },
    ],
  },
  domainVerdictThresholds: {
    lowSampleThreshold: 5,
    riskHealthyMax: 10,
    riskWatchMax: 30,
  },
  bucketLabels: {
    safe: "Safe",
    risky: "Risky",
    unsafe: "Unsafe",
    processing: "Processing",
    cancelled: "Cancelled",
    unknown: "Unknown",
  },
  bucketIcons: {
    safe: "CheckCircle2",
    risky: "AlertTriangle",
    unsafe: "XCircle",
    processing: "Loader2",
    cancelled: "Ban",
    unknown: "HelpCircle",
  },
  domainVerdicts: {
    lowSample: "Low Sample",
    healthy: "Healthy",
    watch: "Watch",
    highRisk: "High Risk",
  },
  domainMxStatuses: ["Valid", "No MX", "Unknown"],
  domainFlags: ["Disposable", "Role Based", "Catch All"],
};

// ── Runtime config (populated by loadConfig()) ──
let moduleConfig = { ...EMBEDDED_DEFAULTS, loaded: false };

/**
 * Load config from backend. Called once at app bootstrap.
 * On failure, logs warning and keeps embedded defaults (no async crash).
 */
export async function loadConfig() {
  try {
    const base = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
    const res = await fetch(`${base}/api/v1/config/status-mapping`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    moduleConfig = { ...EMBEDDED_DEFAULTS, ...json, loaded: true };
  } catch (err) {
    console.warn("[statusBucket] config fetch failed, using embedded defaults:", err);
    moduleConfig = { ...EMBEDDED_DEFAULTS, loaded: true };
  }
}

/**
 * Ensure config is loaded. Returns Promise that resolves when ready.
 * Safe to call multiple times — subsequent calls return immediately.
 * App bootstrap should: await ensureConfigLoaded()
 */
export function ensureConfigLoaded() {
  return moduleConfig.loaded ? Promise.resolve() : loadConfig();
}

/**
 * Synchronous bucket determination — exact same logic as backend bucket_case().
 * Reads from moduleConfig (embedded defaults until loadConfig() resolves).
 *
 * @param {Object} email - { status, disposable, role_based, catch_all }
 * @returns {'safe'|'risky'|'unsafe'|'processing'} - bucket for UI rendering
 */
export function getStatusBucket({ status, disposable, role_based, catch_all }) {
  const statusLower = (status || "").toLowerCase();
  const { safeStatuses, riskyStatuses, unsafeStatuses, processingStatus } =
    moduleConfig.emailStatusBuckets;

  // 1. Disposable is always unsafe (highest priority)
  if (disposable === true) {
    return "unsafe";
  }

  // 2. Safe status but role_based or catch_all -> reclassify as risky
  if (safeStatuses.includes(statusLower) && (role_based === true || catch_all === true)) {
    return "risky";
  }

  // 3. Safe status
  if (safeStatuses.includes(statusLower)) {
    return "safe";
  }

  // 4. Risky/uncertain status
  if (riskyStatuses.includes(statusLower)) {
    return "risky";
  }

  // 5. Unsafe status
  if (unsafeStatuses.includes(statusLower)) {
    return "unsafe";
  }

  // 6. Processing
  if (statusLower === processingStatus) {
    return "processing";
  }

  // 7. Default (matches backend's ELSE 'unsafe')
  return "unsafe";
}

/**
 * Get display label for a bucket.
 * @param {string} bucket - 'safe'|'risky'|'unsafe'|'processing'|...
 * @returns {string} - Human-readable label
 */
export function getBucketLabel(bucket) {
  return moduleConfig.bucketLabels[bucket] || moduleConfig.bucketLabels.unknown || "Unknown";
}

/**
 * Get Lucide icon name for a bucket.
 * @param {string} bucket - 'safe'|'risky'|'unsafe'|'processing'|...
 * @returns {string} - Lucide icon component name
 */
export function getBucketIcon(bucket) {
  return moduleConfig.bucketIcons[bucket] || moduleConfig.bucketIcons.unknown || "HelpCircle";
}

/**
 * Get domain verdict label from risk percent and total emails.
 * Mirrors backend's _verdict() logic in dashboard.py.
 *
 * @param {number} riskPercent - 0-100
 * @param {number} totalEmails - total emails for this domain
 * @returns {string} - 'Low Sample' | 'Healthy' | 'Watch' | 'High Risk'
 */
export function getDomainVerdict(riskPercent, totalEmails) {
  const { lowSampleThreshold, riskHealthyMax, riskWatchMax } =
    moduleConfig.domainVerdictThresholds;

  if (totalEmails < lowSampleThreshold) {
    return moduleConfig.domainVerdicts.lowSample;
  }
  if (riskPercent <= riskHealthyMax) {
    return moduleConfig.domainVerdicts.healthy;
  }
  if (riskPercent <= riskWatchMax) {
    return moduleConfig.domainVerdicts.watch;
  }
  return moduleConfig.domainVerdicts.highRisk;
}

/**
 * Export config getters for advanced use (not needed by most components).
 */
export function getConfig() {
  return { ...moduleConfig };
}