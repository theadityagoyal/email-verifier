import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.models import Base
from models.models import Job, Email, JobStatus, EmailStatus, Domain
from tasks.verification_tasks import verify_single_email_task, process_bulk_job, _update_domain_stats, _update_job_counter
from services.email_service import EmailVerifyResponse

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override the dependency to use the test DB
from models.database import AsyncSessionLocal as OriginalSessionLocal, SyncSessionLocal as OriginalSyncSessionLocal
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def override_sync_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

# We'll directly use TestingSessionLocal in tests

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_verify_single_email_task_new():
    db = TestingSessionLocal()
    # Mock verify_email to return a valid response
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
        # Call the task function directly (it expects self param for bound task; we can pass None)
        result = verify_single_email_task.__wrapped__(None, "test@example.com", job_id=None)
        # The function returns the model dict
        assert result["email"] == "test@example.com"
        assert result["status"] == "verified"
        # Check DB
        email_obj = db.query(Email).filter(Email.email == "test@example.com").first()
        assert email_obj is not None
        assert email_obj.status == EmailStatus.verified
        assert email_obj.score == 100
        db.close()

def test_verify_single_email_task_existing():
    db = TestingSessionLocal()
    # Insert existing record
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
    # Mock verify_email to return updated info
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
        result = verify_single_email_task.__wrapped__(None, "test@example.com", job_id=None)
        assert result["status"] == "verified"
        db.refresh(existing)
        assert existing.status == EmailStatus.verified
        assert existing.score == 95
        assert existing.domain == "example.com"
        db.close()

def test_update_domain_stats():
    db = TestingSessionLocal()
    # Ensure no domain record
    from models.models import Domain
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
    assert domain_rec.bounce_rate == 50.0  # 1/2*100
    db.close()

def test_update_job_counter():
    db = TestingSessionLocal()
    job = Job(job_id="test-job", file_name="test.csv", s3_key="local:test-job/test.csv", status=JobStatus.pending, total=5)
    db.add(job)
    db.commit()
    # Simulate processing a verified email
    _update_job_counter(db, "test-job", EmailStatus.verified)
    db.refresh(job)
    assert job.processed == 1
    assert job.verified == 1
    assert job.status == JobStatus.pending  # not yet completed
    # Process 4 more verified
    for _ in range(4):
        _update_job_counter(db, "test-job", EmailStatus.verified)
    db.refresh(job)
    assert job.processed == 5
    assert job.verified == 5
    assert job.status == JobStatus.completed
    db.close()

def test_process_bulk_job_simple():
    # This is more integration; we'll just ensure the task runs without error given a mocked file.
    # We'll mock the file download and pandas read.
    pass  # placeholder for now