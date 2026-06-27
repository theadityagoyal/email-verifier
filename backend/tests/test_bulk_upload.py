import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from main import app
from models.models import Base
from models.models import Job, Email, JobStatus, EmailStatus

# Use an in-memory SQLite database for testing
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Override the dependency to use the test DB
from models.database import AsyncSessionLocal as OriginalSessionLocal
def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

app.dependency_overrides[OriginalSessionLocal] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

def test_bulk_upload_success():
    csv_content = b"email\nalice@example.com\nbob@test.com\nALICE@EXAMPLE.COM"
    files = {"file": ("test.csv", io.BytesIO(csv_content), "text/csv")}
    resp = client.post("/api/v1/bulk-upload", files=files)
    assert resp.status_code == 202
    data = resp.json()
    assert data["total_emails"] == 2  # deduped, lowercased
    job_id = data["job_id"]
    # Poll until completed (simple loop)
    for _ in range(10):
        r = client.get(f"/api/v1/jobs/{job_id}")
        assert r.status_code == 200
        job = r.json()
        if job["status"] == "completed":
            break
    assert job["status"] == "completed"
    assert job["processed"] == 2
    assert job["verified"] == 2  # both are valid domains

def test_bulk_upload_wrong_type():
    files = {"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")}
    resp = client.post("/api/v1/bulk-upload", files=files)
    assert resp.status_code == 400
    assert "Only CSV and Excel files" in resp.json()["detail"]

def test_bulk_upload_empty_file():
    files = {"file": ("empty.csv", io.BytesIO(b""), "text/csv")}
    resp = client.post("/api/v1/bulk-upload", files=files)
    assert resp.status_code == 400
    assert "File is empty" in resp.json()["detail"]

def test_bulk_upload_no_valid_emails():
    csv_content = b"email\nnot-an-email\nalso-invalid"
    files = {"file": ("bad.csv", io.BytesIO(csv_content), "text/csv")}
    resp = client.post("/api/v1/bulk-upload", files=files)
    assert resp.status_code == 400
    assert "No valid emails found" in resp.json()["detail"]

def test_bulk_upload_duplicate_and_case_variants():
    csv_content = b"email\nTest@Domain.COM\nTEST@domain.com\nuser@other.org\nUSER@OTHER.ORG"
    files = {"file": ("dup.csv", io.BytesIO(csv_content), "text/csv")}
    resp = client.post("/api/v1/bulk-upload", files=files)
    assert resp.status_code == 202
    data = resp.json()
    assert data["total_emails"] == 2  # test@domain.com, user@other.org
    job_id = data["job_id"]
    for _ in range(10):
        r = client.get(f"/api/v1/jobs/{job_id}")
        assert r.status_code == 200
        job = r.json()
        if job["status"] == "completed":
            break
    assert job["status"] == "completed"
    assert job["processed"] == 2
    assert job["verified"] == 2