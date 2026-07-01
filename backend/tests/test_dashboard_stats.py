import pytest
from backend.schemas.schemas import DashboardStats

def test_dashboard_stats_schema():
    # Test that the schema can be instantiated with example data
    data = {
        "total_emails": 100,
        "per_status_counts": {"verified": 50, "deliverable": 20, "trusted": 10, "probably_valid": 5, "risky": 5, "unconfirmed": 3, "uncertain": 2, "invalid": 3, "undeliverable": 1, "processing": 1},
        "bucket_counts": {"safe": 85, "risky": 10, "unsafe": 4, "processing": 1},
        "trust_score": 85,
        "flagged_counts": {"disposable": 5, "role_based": 3, "catch_all": 2},
        "top_domains": [{"domain": "example.com", "bucket_counts": {"safe": 10, "risky": 2, "unsafe": 1, "processing": 0}}],
        "daily_volume": [{"date": "2026-06-25", "bucket_counts": {"safe": 12, "risky": 1, "unsafe": 0, "processing": 2}}],
        "active_job": {"job_id": "job_123", "file_name": "emails.csv", "progress_percent": 45, "processed": 450, "total": 1000}
    }
    stats = DashboardStats(**data)
    assert stats.total_emails == 100
    assert stats.trust_score == 85