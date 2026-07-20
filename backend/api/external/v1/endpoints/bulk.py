"""
External developer API — bulk email verification.
Auth: X-API-Key header. Rate limit: api_key.bulk_limit_per_hour (default 5/hour).

Flow (async job pattern, same as the internal dashboard):
  1. POST /bulk           -> upload file, get job_id back immediately
  2. GET  /jobs/{job_id}   -> poll status until status == "completed"
  3. GET  /jobs/{job_id}/export -> download CSV of results
"""
import io
import os
import uuid

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.database import get_db
from models.models import Job, Email, JobStatus, ApiKey
from api.external.v1.dependencies import rate_limit_bulk, get_api_key
from utils.email_utils import detect_email_column
from utils.file_utils import read_upload_file, FileReadError, SUPPORTED_EXTENSIONS, is_supported_filename, sanitize_filename
from utils.usage_logger import log_api_usage
from utils.logging import get_logger
from utils.timezone import utc_now_naive
from tasks.bulk_processor import process_bulk_job_sync

router = APIRouter(tags=["External API - Bulk"])
logger = get_logger(__name__)

MAX_FILE_SIZE_MB = 50
UPLOAD_BASE_DIR = "/tmp/uploads"


def _read_file(content: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel bytes into a DataFrame, raising HTTPException on failure."""
    try:
        return read_upload_file(content, filename)
    except FileReadError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": "file_read_error", "message": str(e)},
        )


@router.post("/bulk", status_code=status.HTTP_202_ACCEPTED)
async def external_bulk_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    api_key: ApiKey = Depends(rate_limit_bulk),
):
    """Upload a CSV/Excel file for bulk email verification. Returns a job_id to poll."""
    # Tracks the actual HTTP status returned, for usage logging in `finally`
    # below. Starts at 202 (the endpoint's declared success status_code);
    # any HTTPException raised along the way overrides it with the real code.
    resp_status = status.HTTP_202_ACCEPTED
    try:
        original_filename = file.filename or ""
        safe_filename = sanitize_filename(original_filename)
        filename_lower = safe_filename.lower()
        if not is_supported_filename(filename_lower):
            raise HTTPException(
                status_code=400,
                detail={"code": "unsupported_format", "message": f"Only {', '.join(SUPPORTED_EXTENSIONS)} files accepted"},
            )

        content = await file.read()
        if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail={"code": "file_too_large", "message": f"File too large. Max {MAX_FILE_SIZE_MB} MB"},
            )

        df = _read_file(content, safe_filename)
        if df.empty:
            raise HTTPException(status_code=400, detail={"code": "empty_file", "message": "File is empty"})

        try:
            email_col = detect_email_column(df)
        except ValueError as e:
            raise HTTPException(status_code=400, detail={"code": "no_email_column", "message": str(e)})

        email_series = df[email_col].dropna().astype(str).str.strip().str.lower()
        unique_emails = email_series[email_series.str.contains("@")].unique().tolist()
        total = len(unique_emails)

        if total == 0:
            raise HTTPException(status_code=400, detail={"code": "no_valid_emails", "message": "No valid emails found in file"})

        job_id = str(uuid.uuid4())

        # Sanitize filename for filesystem use (prevents path traversal)
        s3_key = f"local:{job_id}/{safe_filename}"

        try:
            os.makedirs(f"{UPLOAD_BASE_DIR}/{job_id}", exist_ok=True)
            with open(f"{UPLOAD_BASE_DIR}/{job_id}/{safe_filename}", "wb") as f:
                f.write(content)
            s3_key = f"local:{job_id}/{safe_filename}"
            logger.info("external_bulk_save_failed", job_id=job_id, path=s3_key)
        except OSError as e:
            logger.error("external_bulk_save_failed", job_id=job_id, error=str(e), exc_info=True)
            raise HTTPException(status_code=500, detail={"code": "storage_error", "message": "Failed to save uploaded file"})

        job = Job(
            job_id=job_id,
            file_name=original_filename,  # Store original for display/download
            s3_key=s3_key,
            status=JobStatus.processing,
            current_stage="uploading",
            progress_percent=0,
            estimated_time_remaining=None,
            started_at=None,
            completed_at=None,
            error_details=None,
            total=total,
            created_at=utc_now_naive(),
        )
        db.add(job)
        await db.commit()

        background_tasks.add_task(process_bulk_job_sync, job_id, s3_key, email_col)
        logger.info("external_bulk_job_dispatched", job_id=job_id, api_key_id=api_key.id, total=total)

        return {
            "success": True,
            "data": {"job_id": job_id, "status": "processing", "total_emails": total},
        }
    except HTTPException as he:
        resp_status = he.status_code
        raise
    except Exception:
        resp_status = 500
        raise
    finally:
        await log_api_usage(api_key.id, "bulk", resp_status)


@router.get("/jobs/{job_id}")
async def external_get_job_status(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_api_key),
):
    """Poll the status of a previously submitted bulk job."""
    job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail={"code": "job_not_found", "message": "Job not found"})

    return {
        "success": True,
        "data": {
            "job_id": job.job_id,
            "status": job.status.value,
            "current_stage": job.current_stage,
            "progress_percent": job.progress_percent,
            "total": job.total,
            "processed": job.processed,
            "verified": job.verified,
            "invalid": job.invalid,
            "risky": job.risky,
            "estimated_time_remaining": job.estimated_time_remaining,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "error_message": job.error_message,
        },
    }


@router.get("/jobs/{job_id}/export")
async def external_export_job_results(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    api_key: ApiKey = Depends(get_api_key),
):
    """Download verification results for a completed job as CSV."""
    job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail={"code": "job_not_found", "message": "Job not found"})

    if job.status != JobStatus.completed:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "job_not_completed",
                "message": f"Job status is '{job.status.value}'. Wait until it's 'completed' before exporting.",
            },
        )

    emails_db = (await db.execute(select(Email).where(Email.job_id == job_id))).scalars().all()

    out_df = pd.DataFrame([{
        "email": e.email,
        "domain": e.domain,
        "status": e.status.value if e.status else "",
        "score": e.score,
        "disposable": e.disposable,
        "role_based": e.role_based,
        "catch_all": e.catch_all,
        "mx_found": e.mx_found,
        "smtp_valid": e.smtp_valid,
        "verified_at": str(e.verified_at) if e.verified_at else "",
    } for e in emails_db])

    output = io.StringIO()
    out_df.to_csv(output, index=False)
    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=verified_{sanitize_filename(job.file_name)}"},
    )
