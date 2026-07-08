import uuid
import io
import os
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
import pandas as pd
from pandas.errors import ParserError

from models.database import get_db
from models.models import Job, Email, JobStatus
from schemas.schemas import JobStatusResponse, BulkUploadResponse
from utils.config import settings
from utils.logging import get_logger
from utils.email_utils import detect_email_column


# Constants
MAX_FILE_SIZE_MB = 50
SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"]
UPLOAD_BASE_DIR = "/tmp/uploads"



# Import the sync processor
from tasks.bulk_processor import (
    process_bulk_job_sync,
    verify_single_email_sync,
)

router = APIRouter(tags=["Bulk"])
logger = get_logger(__name__)


def _read_file(content: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel file into DataFrame."""
    try:
        if filename.endswith(".csv"):
            for encoding in ["utf-8", "latin-1", "cp1252"]:
                try:
                    df = pd.read_csv(io.BytesIO(content), encoding=encoding)
                    return df
                except UnicodeDecodeError:
                    continue
                except ParserError as e:
                    logger.warning(f"CSV parsing error with encoding {encoding}: {str(e)}")
                    # Fallback: treat each line as a single column (email)
                    try:
                        text = content.decode(encoding, errors="replace")
                    except UnicodeDecodeError:
                        text = content.decode("utf-8", errors="replace")
                    lines = [line.strip() for line in text.splitlines() if line.strip() != ""]
                    if not lines:
                        return pd.DataFrame(columns=["email"])
                    header = lines[0]
                    data_lines = lines[1:] if "@" not in header or header.lower().startswith("email") else lines
                    col_name = "email" if header.lower() == "email" else header
                    df = pd.DataFrame({col_name: data_lines})
                    return df
        elif filename.endswith((".xlsx", ".xls")):
            try:
                return pd.read_excel(io.BytesIO(content))
            except Exception as e:
                logger.error(f"Excel file reading failed: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Excel file reading failed: {str(e)}")
        raise ValueError("Unsupported file format")
    except Exception as exc:
        logger.error(f"File read error: {str(exc)}")
        raise HTTPException(status_code=400, detail=f"File read error: {str(exc)}")


def _detect_email_column(df: pd.DataFrame) -> str:
    """Auto detect email column from DataFrame (shared utility)."""
    try:
        return detect_email_column(df)
    except ValueError as exc:
        logger.warning(f"Email column detection failed: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/bulk-upload", response_model=BulkUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def bulk_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Upload CSV or Excel file for bulk email verification."""
    try:
        filename = file.filename.lower()
        if not any(filename.endswith(ext) for ext in SUPPORTED_EXTENSIONS):
            raise HTTPException(status_code=400, detail=f"Only {', '.join(SUPPORTED_EXTENSIONS)} files accepted.")

        content = await file.read()
        if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_FILE_SIZE_MB} MB.")

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
        try:
            os.makedirs(f"{UPLOAD_BASE_DIR}/{job_id}", exist_ok=True)
            with open(f"{UPLOAD_BASE_DIR}/{job_id}/{file.filename}", "wb") as f:
                f.write(content)
            s3_key = f"local:{job_id}/{file.filename}"
            logger.info("file_saved_local", path=s3_key)
        except OSError as e:
            logger.error(f"Failed to save file for job {job_id}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {str(e)}")

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

        # Start processing the job in background using FastAPI BackgroundTasks
        logger.info("about_to_dispatch_bulk_job", job_id=job_id, email_col=email_col)
        background_tasks.add_task(process_bulk_job_sync, job_id, s3_key, email_col)
        logger.info("bulk_job_dispatched", job_id=job_id)

        return BulkUploadResponse(job_id=job_id, message="Job queued", total_emails=total)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in bulk_upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/jobs")
async def list_jobs(db: AsyncSession = Depends(get_db)):
    """
    Return all bulk upload jobs ordered by newest first.
    Used by the frontend to restore upload history after refresh/navigation.
    """
    try:
        jobs = (
            await db.execute(
                select(Job).order_by(desc(Job.created_at))
            )
        ).scalars().all()

        return jobs
    except Exception as e:
        logger.error(f"Error retrieving jobs: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve jobs: {str(e)}")

@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    try:
        job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")
        return job
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve job: {str(e)}")


@router.delete("/jobs/{job_id}")
async def delete_job(
    job_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a job and all associated data."""
    try:
        # Get the job
        job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        # Delete associated email records
        await db.execute(delete(Email).where(Email.job_id == job_id))

        # Delete the job itself
        await db.delete(job)
        await db.commit()

        # Delete uploaded file if it exists locally
        try:
            if job.s3_key.startswith("local:"):
                path_part = job.s3_key.replace("local:", "")
                job_id_part, filename = path_part.split("/", 1)
                filepath = f"{UPLOAD_BASE_DIR}/{job_id_part}/{filename}"
                try:
                    os.remove(filepath)
                except OSError as e:
                    if e.errno != 2:  # ENOENT - file not found
                        raise  # Re-raise if it's not a "file not found" error
                    # File doesn't exist, which is fine
        except Exception as e:
            logger.warning("could_not_delete_file", job_id=job_id, error=str(e))

        return {"message": "deleted", "job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {str(e)}")

@router.get("/jobs/{job_id}/export")
async def export_job_results(job_id: str, db: AsyncSession = Depends(get_db)):
    """Export original file with verification results added as new columns."""
    try:
        job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")

        # Load original file
        try:
            s3_key = job.s3_key
            if s3_key.startswith("local:"):
                path_part = s3_key.replace("local:", "")
                job_id_part, filename = path_part.split("/", 1)
                try:
                    with open(f"{UPLOAD_BASE_DIR}/{job_id_part}/{filename}", "rb") as f:
                        content = f.read()
                    original_df = _read_file(content, filename)
                except OSError as e:
                    if e.errno == 2:  # ENOENT - file not found
                        logger.warning(f"File not found for job {job_id}: {str(e)}")
                        # Fall through to fallback
                        original_df = None
                    else:
                        raise  # Re-raise if it's not a "file not found" error
            else:
                from services.s3_service import download_file_from_s3
                content = download_file_from_s3(s3_key)
                original_df = _read_file(content, job.file_name)

            email_col = _detect_email_column(original_df)

        except Exception:
            # Fallback — create fresh from DB
            original_df = None
            email_col = "email"

        # Fetch verified results from DB (only for this block
        # Fetch verified results from DB (only for this job)
        emails_db = (await db.execute(select(Email).where(Email.job_id == job_id))).scalars().all()
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting job results for {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to export job results: {str(e)}")