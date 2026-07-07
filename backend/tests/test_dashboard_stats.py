import pytest
from datetime import date
from schemas.schemas import DashboardStats
from unittest.mock import MagicMock, AsyncMock, Mock


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


@pytest.mark.asyncio
async def test_get_dashboard_stats(mocker):
    # Mock external dependencies that are imported at module level
    mocker.patch('sqlalchemy.ext.asyncio.create_async_engine')
    mocker.patch('sqlalchemy.create_engine')
    mocker.patch.dict('sys.modules', {'structlog': MagicMock()})
    mocker.patch.dict('sys.modules', {'pandas': MagicMock()})
    # Mock settings
    mock_settings = Mock()
    mock_settings.DATABASE_URL = "sqlite+aiosqlite:///:memory:"
    mocker.patch('utils.config.settings', mock_settings)

    # Define simple classes for the row data
    class StatusRow:
        def __init__(self, status, cnt):
            self.status = status
            self.cnt = cnt

    class FlagRow:
        def __init__(self):
            self.disposable = 5
            self.role_based = 3
            self.catch_all = 2

    class DomainRow:
        def __init__(self):
            self.domain = "example.com"
            self.total_emails = 20
            self.verified_count = 10
            self.invalid_count = 5
            self.risky_count = 3

    class DailyRow:
        def __init__(self, date, status, cnt):
            self.date = date
            self.status = status
            self.cnt = cnt

    class JobRow:
        def __init__(self):
            self.job_id = "job_123"
            self.file_name = "emails.csv"
            self.progress_percent = 45
            self.processed = 450
            self.total = 1000
            self.status = "processing"

    # We'll keep track of how many times db.execute has been called
    call_count = 0

    # Define the side effect function for db.execute
    async def execute_side_effect(*args, **kwargs):
        nonlocal call_count
        print(f"[DEBUG] db.execute called, call_count: {call_count}")
        # We have 5 calls to expect
        if call_count == 0:
            # First call: status count
            result = MagicMock()
            result.all = MagicMock(return_value=[
                StatusRow("verified", 50),
                StatusRow("deliverable", 20),
                StatusRow("trusted", 10),
                StatusRow("probably_valid", 5),
                StatusRow("risky", 5),
                StatusRow("unconfirmed", 3),
                StatusRow("uncertain", 2),
                StatusRow("invalid", 3),
                StatusRow("undeliverable", 1),
                StatusRow("processing", 1)
            ])
            print(f"[DEBUG] Returning status result")
            call_count += 1
            return result
        elif call_count == 1:
            # Second call: flag counts
            result = MagicMock()
            # We'll print when the all method is called
            def all_side_effect():
                result_list = [FlagRow()]
                print(f"[DEBUG] flag_result.all() called, returning: {result_list}")
                print(f"[DEBUG] First item type: {type(result_list[0])}")
                print(f"[DEBUG] First item disposable: {result_list[0].disposable} (type: {type(result_list[0].disposable)})")
                return result_list
            result.all = MagicMock(side_effect=all_side_effect)
            print(f"[DEBUG] Returning flag result")
            call_count += 1
            return result
        elif call_count == 2:
            # Third call: top domains
            result = MagicMock()
            scalars = MagicMock()
            scalars.all = MagicMock(return_value=[DomainRow()])
            result.scalars = MagicMock(return_value=scalars)
            print(f"[DEBUG] Returning domain result")
            call_count += 1
            return result
        elif call_count == 3:
            # Fourth call: daily volume
            from models.models import EmailStatus
            # We need to return rows that will result in:
            # safe: 12 (verified+deliverable+trusted+probably_valid)
            # risky: 1 (risky+unconfirmed+uncertain)
            # unsafe: 0 (invalid+undeliverable)
            # processing: 2
            # Let's distribute as:
            # verified: 7, deliverable: 3, trusted: 2, probably_valid: 0 -> safe=12
            # risky: 1, unconfirmed: 0, uncertain: 0 -> risky=1
            # invalid: 0, undeliverable: 0 -> unsafe=0
            # processing: 2
            daily_rows = [
                DailyRow(date(2026, 6, 25), EmailStatus.verified, 7),
                DailyRow(date(2026, 6, 25), EmailStatus.deliverable, 3),
                DailyRow(date(2026, 6, 25), EmailStatus.trusted, 2),
                DailyRow(date(2026, 6, 25), EmailStatus.risky, 1),
                DailyRow(date(2026, 6, 25), EmailStatus.processing, 2),
            ]
            result = MagicMock()
            result.all = MagicMock(return_value=daily_rows)
            print(f"[DEBUG] Returning daily result")
            call_count += 1
            return result
        elif call_count == 4:
            # Fifth call: active job
            result = MagicMock()
            result.scalar_one_or_none = MagicMock(return_value=JobRow())
            print(f"[DEBUG] Returning job result")
            call_count += 1
            return result
        else:
            # If we get here, we've been called too many times
            print(f"[ERROR] db.execute called too many times: {call_count}")
            raise Exception("Too many calls to db.execute")

    # Mock the db session
    mock_db = MagicMock()
    mock_db.execute = AsyncMock(side_effect=execute_side_effect)

    # Import and call the endpoint function
    from api.v1.endpoints.dashboard import get_dashboard_stats
    result = await get_dashboard_stats(db=mock_db)

    # Assertions
    assert result.total_emails == 100
    assert result.per_status_counts["verified"] == 50
    assert result.bucket_counts["safe"] == 77  # verified+deliverable+trusted+probably_valid after overrides
    assert result.bucket_counts["risky"] == 13  # risky+unconfirmed+uncertain after overrides
    assert result.bucket_counts["unsafe"] == 9  # invalid+undeliverable after overrides
    assert result.bucket_counts["processing"] == 1
    assert result.trust_score == 78  # round(77/(77+13+9)*100)
    assert result.flagged_counts["disposable"] == 5
    assert result.active_job.job_id == "job_123"