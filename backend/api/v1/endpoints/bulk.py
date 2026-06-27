import uuid
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import pandas as pd

from models.database import get_db
from models.models import Job, Email, JobStatus
from schemas.schemas import JobStatusResponse, BulkUploadResponse
from services.s3_service import upload_file_to_s3
from tasks.verification_tasks import process_bulk_job
from utils.config import settings
from utils.logging import get_logger
from utils.email_utils import detect_email_column

router = APIRouter(tags=["Bulk"])
logger = get_logger(__name__)


def _read_file(content: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel file into DataFrame."""
    try:
        if filename.endswith(".csv"):
            # Try different encodings
            for encoding in ["utf-8", "latin-1", "cp1252"]:
                try:
                    return pd.read_csv(io.BytesIO(content), encoding=encoding)
                except UnicodeDecodeError:
                    continue
        elif filename.endswith((".xlsx", ".xls")):
            return pd.read_excel(io.BytesIO(content))
        raise ValueError("Unsupported file format")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"File read error: {str(exc)}")


def _detect_email_column(df: pd.DataFrame) -> str:
    """Auto detect email column from DataFrame (shared utility)."""
    try:
        return detect_email_column(df)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/bulk-upload", response_model=BulkUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def bulk_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload CSV or Excel file for bulk email verification."""
    filename = file.filename.lower()
    if not any(filename.endswith(ext) for ext in [".csv", ".xlsx", ".xls"]):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files accepted.")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Max 50 MB.")

    # Read file
    df = _read_file(content, file.filename)

    if df.empty:
        raise HTTPException(status_code=400, detail="File is empty.")

    # Detect email column
    email_col = _detect_email_column(df)

    # Count valid emails (normalise & deduplicate as worker does)
    email_series = (
        df[email_col]
        .dropna()
        .astype(str)
        .str.strip()
        .str.lower()
    )
    unique_emails = email_series[email_series.str.contains("@")].unique().tolist()
    total = len(unique_emails)

    if total == 0:
        raise HTTPException(status_code=400, detail="No valid emails found in file.")

    job_id = str(uuid.uuid4())
    s3_key = f"uploads/{job_id}/{file.filename}"

    # Upload to local storage (S3 optional)
    import os
    os.makedirs(f"/tmp/uploads/{job_id}", exist_ok=True)
    with open(f"/tmp/uploads/{job_id}/{file.filename}", "wb") as f:
        f.write(content)
    s3_key = f"local:{job_id}/{file.filename}"
    logger.info("file_saved_local", path=s3_key)

    # Save job
    job = Job(
        job_id=job_id,
        file_name=file.filename,
        s3_key=s3_key,
        status=JobStatus.pending,
        current_stage='uploading',
        progress_percent=0,
        estimated_time_remaining=None,
        started_at=None,
        completed_at=None,
        error_details=None,
        total=total,
    )
    db.add(job)
    await db.commit()

    # Start processing the job
    from tasks.verification_tasks import process_bulk_job
    logger.info("about_to_dispatch_bulk_job", job_id=job_id, email_col=email_col)
    process_bulk_job.delay(job_id, s3_key, email_col)
    logger.info("bulk_job_dispatched", job_id=job_id)

    return BulkUploadResponse(job_id=job_id, message="Job queued", total_emails=total)


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job


@router.get("/jobs/{job_id}/export")
async def export_job_results(job_id: str, db: AsyncSession = Depends(get_db)):
    """Export original file with verification results added as new columns."""
    job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Load original file
    try:
        s3_key = job.s3_key
        if s3_key.startswith("local:"):
            path_part = s3_key.replace("local:", "")
            job_id_part, filename = path_part.split("/", 1)
            with open(f"/tmp/uploads/{job_id_part}/{filename}", "rb") as f:
                content = f.read()
            original_df = _read_file(content, filename)
        else:
            from services.s3_service import download_file_from_s3
            content = download_file_from_s3(s3_key)
            original_df = _read_file(content, job.file_name)

        email_col = _detect_email_column(original_df)

    except Exception:
        # Fallback — create fresh from DB
        original_df = None
        email_col = "email"

    # Fetch verified results from DB
    emails_db = (await db.execute(select(Email))).scalars().all()
    results_map = {e.email: e for e in emails_db}

    if original_df is not None:
        # Add result columns to original sheet
        df = original_df.copy()
        emails_series = df[email_col].astype(str).str.strip().str.lower()

        df["ev_status"] = emails_series.map(lambda e: results_map[e].status.value if e in results_map else "not_processed")
        df["ev_score"] = emails_series.map(lambda e: results_map[e].score if e in results_map else "")
        df["ev_disposable"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].disposable else "No")
        df["ev_role_based"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].role_based else "No")
        df["ev_catch_all"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].catch_all else "No")
        df["ev_mx_found"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].mx_found else "No")
        df["ev_smtp_valid"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].smtp_valid else "No")
        df["ev_verified_at"] = emails_series.map(lambda e: str(results_map[e].verified_at) if e in results_map and results_map[e].verified_at else "")
    else:
        # Fallback fresh sheet
        df = pd.DataFrame([{
            "email": e.email,
            "ev_status": e.status.value if e.status else "",
            "ev_score": e.score,
            "ev_disposable": "Yes" if e.disposable else "No",
            "ev_role_based": "Yes" if e.role_based else "No",
            "ev_catch_all": "Yes" if e.catch_all else "No",
            "ev_mx_found": "Yes" if e.mx_found else "No",
            "ev_smtp_valid": "Yes" if e.smtp_valid else "No",
            "ev_verified_at": str(e.verified_at) if e.verified_at else "",
        } for e in emails_db])

    output = io.StringIO()
    df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=verified_{job.file_name}"},
    )