import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.models import Base
from models.models import Job, Email, JobStatus, EmailStatus, Domain
from services.email_service import EmailVerifyResponse

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


def test_verify_single_email_sync_new():
    db = TestingSessionLocal()
    mock_result = EmailVerifyResponse(
        email="test@example.com",
        domain="example.com",
        status=EmailStatus.verified,
        syntax_valid=True,
        domain_exists=True,
        mx_found=True,
        smtp_valid=True,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=100,
        verified_at=None,
        username_quality=None,
        username_flags=None,
    )
    with patch("services.email_service.verify_email", return_value=mock_result):
        from tasks.bulk_processor import verify_single_email_sync
        result = verify_single_email_sync("test@example.com", job_id=None)
        assert result["email"] == "test@example.com"
        assert result["status"] == "verified"
        email_obj = db.query(Email).filter(Email.email == "test@example.com").first()
        assert email_obj is not None
        assert email_obj.status == EmailStatus.verified
        assert email_obj.score == 100
    db.close()


def test_verify_single_email_sync_existing():
    db = TestingSessionLocal()
    existing = Email(
        email="test@example.com",
        domain="old.com",
        status=EmailStatus.invalid,
        syntax_valid=False,
        domain_exists=False,
        mx_found=False,
        smtp_valid=False,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=0,
    )
    db.add(existing)
    db.commit()
    mock_result = EmailVerifyResponse(
        email="test@example.com",
        domain="example.com",
        status=EmailStatus.verified,
        syntax_valid=True,
        domain_exists=True,
        mx_found=True,
        smtp_valid=True,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=95,
        verified_at=None,
        username_quality=None,
        username_flags=None,
    )
    with patch("services.email_service.verify_email", return_value=mock_result):
        from tasks.bulk_processor import verify_single_email_sync
        result = verify_single_email_sync("test@example.com", job_id=None)
        assert result["status"] == "verified"
        db.refresh(existing)
        assert existing.status == EmailStatus.verified
        assert existing.score == 95
        assert existing.domain == "example.com"
    db.close()


def test_update_domain_stats():
    db = TestingSessionLocal()
    assert db.query(Domain).filter(Domain.domain == "example.com").count() == 0
    mock_result = EmailVerifyResponse(
        email="test@example.com",
        domain="example.com",
        status=EmailStatus.verified,
        syntax_valid=True,
        domain_exists=True,
        mx_found=True,
        smtp_valid=True,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=100,
        verified_at=None,
        username_quality=None,
        username_flags=None,
    )
    from tasks.bulk_processor import _update_domain_stats
    _update_domain_stats(db, mock_result)
    domain_rec = db.query(Domain).filter(Domain.domain == "example.com").first()
    assert domain_rec is not None
    assert domain_rec.total_emails == 1
    assert domain_rec.verified_count == 1
    assert domain_rec.invalid_count == 0
    assert domain_rec.risky_count == 0

    # Add another email same domain, invalid
    mock_result2 = EmailVerifyResponse(
        email="test2@example.com",
        domain="example.com",
        status=EmailStatus.invalid,
        syntax_valid=False,
        domain_exists=False,
        mx_found=False,
        smtp_valid=False,
        disposable=False,
        role_based=False,
        catch_all=False,
        score=0,
        verified_at=None,
        username_quality=None,
        username_flags=None,
    )
    _update_domain_stats(db, mock_result2)
    db.refresh(domain_rec)
    assert domain_rec.total_emails == 2
    assert domain_rec.verified_count == 1
    assert domain_rec.invalid_count == 1
    assert domain_rec.risky_count == 0
    assert domain_rec.bounce_rate == 50.0
    db.close()


def test_update_job_counter():
    db = TestingSessionLocal()
    job = Job(job_id="test-job", file_name="test.csv", s3_key="local:test-job/test.csv", status=JobStatus.pending, total=5)
    db.add(job)
    db.commit()
    from tasks.bulk_processor import _update_job_counter
    _update_job_counter(db, "test-job", EmailStatus.verified)
    db.refresh(job)
    assert job.processed == 1
    assert job.verified == 1
    assert job.status == JobStatus.pending
    for _ in range(4):
        _update_job_counter(db, "test-job", EmailStatus.verified)
    db.refresh(job)
    assert job.processed == 5
    assert job.verified == 5
    assert job.status == JobStatus.completed
    db.close()


def test_process_bulk_job_sync():
    """Test bulk job processing with mocked file and email verification."""
    import io
    import pandas as pd
    from unittest.mock import patch, mock_open

    db = TestingSessionLocal()

    job = Job(job_id="bulk-test", file_name="test.csv", s3_key="local:bulk-test/test.csv", status=JobStatus.pending, total=3)
    db.add(job)
    db.commit()

    # Create mock CSV content
    csv_content = "email\nuser1@gmail.com\nuser2@yahoo.com\nuser3@invalid.xyz\n"

    mock_results = [
        EmailVerifyResponse(email="user1@gmail.com", domain="gmail.com", status=EmailStatus.trusted, syntax_valid=True, domain_exists=True, mx_found=True, smtp_valid=False, disposable=False, role_based=False, catch_all=False, score=90, verified_at=None, username_quality=None, username_flags=None),
        EmailVerifyResponse(email="user2@yahoo.com", domain="yahoo.com", status=EmailStatus.trusted, syntax_valid=True, domain_exists=True, mx_found=True, smtp_valid=False, disposable=False, role_based=False, catch_all=False, score=90, verified_at=None, username_quality=None, username_flags=None),
        EmailVerifyResponse(email="user3@invalid.xyz", domain="invalid.xyz", status=EmailStatus.invalid, syntax_valid=True, domain_exists=False, mx_found=False, smtp_valid=False, disposable=False, role_based=False, catch_all=False, score=0, verified_at=None, username_quality=None, username_flags=None),
    ]

    with patch("services.email_service.verify_email", side_effect=mock_results):
        with patch("builtins.open", mock_open(read_data=csv_content)):
            with patch("os.path.exists", return_value=True):
                with patch("pandas.read_csv") as mock_read:
                    df = pd.DataFrame({"email": ["user1@gmail.com", "user2@yahoo.com", "user3@invalid.xyz"]})
                    mock_read.return_value = df
                    from tasks.bulk_processor import process_bulk_job_sync
                    process_bulk_job_sync("bulk-test", "local:bulk-test/test.csv", "email")

    db.refresh(job)
    assert job.status == JobStatus.completed
    assert job.processed == 3
    assert job.verified == 2
    assert job.invalid == 1
    db.close()