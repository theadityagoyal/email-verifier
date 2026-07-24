"""
Configuration endpoint — serves status/bucket mapping to frontend.
Single source of truth for bucket_case() logic, domain verdict thresholds,
labels, and icons. Eliminates drift between backend dashboard.py and frontend
statusBucket.js.
"""
from fastapi import APIRouter

from api.v1.endpoints.dashboard import (
    SAFE_STATUSES,
    RISKY_STATUSES,
    UNSAFE_STATUSES,
    LOW_SAMPLE_THRESHOLD,
    RISK_HEALTHY_MAX,
    RISK_WATCH_MAX,
)

router = APIRouter(tags=["Config"])


@router.get("/config/status-mapping")
def get_status_mapping():
    """
    Returns JSON containing all status-bucket mapping, domain verdict thresholds,
    display labels, and icon names. Frontend loads this at startup and caches it.

    Response shape mirrors the exact logic in dashboard.py's bucket_case() and _verdict().
    """
    return {
        # ---- Email status → bucket mapping (matches dashboard.py bucket_case) ----
        "emailStatusBuckets": {
            "safeStatuses": [s.value for s in SAFE_STATUSES],
            "riskyStatuses": [s.value for s in RISKY_STATUSES],
            "unsafeStatuses": [s.value for s in UNSAFE_STATUSES],
            "processingStatus": "processing",
            # Rules in priority order (same as CASE expression order)
            "bucketRules": [
                {
                    "condition": "disposable",
                    "bucket": "unsafe",
                    "priority": 1,
                },
                {
                    "condition": "safe_status_and_role_or_catchall",
                    "bucket": "risky",
                    "priority": 2,
                },
                {"condition": "safe_status", "bucket": "safe", "priority": 3},
                {"condition": "risky_status", "bucket": "risky", "priority": 4},
                {"condition": "unsafe_status", "bucket": "unsafe", "priority": 5},
                {"condition": "processing", "bucket": "processing", "priority": 6},
                {"condition": "default", "bucket": "unsafe", "priority": 7},
            ],
        },
        # ---- Domain verdict thresholds (matches dashboard.py _verdict) ----
        "domainVerdictThresholds": {
            "lowSampleThreshold": LOW_SAMPLE_THRESHOLD,
            "riskHealthyMax": RISK_HEALTHY_MAX,
            "riskWatchMax": RISK_WATCH_MAX,
        },
        # ---- Display labels (matches frontend getBucketLabel) ----
        "bucketLabels": {
            "safe": "Safe",
            "risky": "Risky",
            "unsafe": "Unsafe",
            "processing": "Processing",
            "cancelled": "Cancelled",
            "unknown": "Unknown",
        },
        # ---- Lucide icon names (matches frontend getBucketIcon) ----
        "bucketIcons": {
            "safe": "CheckCircle2",
            "risky": "AlertTriangle",
            "unsafe": "XCircle",
            "processing": "Loader2",
            "cancelled": "Ban",
            "unknown": "HelpCircle",
        },
        # ---- Domain verdict labels ----
        "domainVerdicts": {
            "lowSample": "Low Sample",
            "healthy": "Healthy",
            "watch": "Watch",
            "highRisk": "High Risk",
        },
        # ---- MX status options (for DomainStats card) ----
        "domainMxStatuses": ["Valid", "No MX", "Unknown"],
        # ---- Domain flag options (for DomainStats card) ----
        "domainFlags": ["Disposable", "Role Based", "Catch All"],
    }