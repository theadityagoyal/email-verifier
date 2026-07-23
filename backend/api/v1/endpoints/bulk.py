import uuid
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, delete
import io
import pandas as pd

from models.database import get_db
from models.models import Job, Email, JobStatus, NotificationType, NotificationPriority
from schemas.schemas import JobStatusResponse, BulkUploadResponse, JobCancelResponse
from services.notification_service import async_create_notification
from utils.logging import get_logger
from utils.timezone import utc_now_naive
from utils.email_utils import detect_email_column
from utils.file_utils import read_upload_file, FileReadError, SUPPORTED_EXTENSIONS, is_supported_filename


# Constants
MAX_FILE_SIZE_MB = 50
UPLOAD_BASE_DIR = "/tmp/uploads"

# ── Export filter buckets ────────────────────────────────────────────────
# Mirrors bucket_case() in api/v1/endpoints/dashboard.py and the JS mirror
# in frontend/src/utils/statusBucket.js — if backend bucket rules change,
# update this too.
EXPORT_SAFE_STATUSES = {"verified", "deliverable", "trusted", "probably_valid"}
EXPORT_RISKY_STATUSES = {"risky", "unconfirmed", "uncertain"}
EXPORT_UNSAFE_STATUSES = {"invalid", "undeliverable"}
VALID_EXPORT_FILTERS = {"all", "safe", "risky", "unsafe"}


def _email_export_bucket(e: Email) -> str:
    """Per-row bucket classification for CSV export filtering. Same logic
    as bucket_case() in dashboard.py, just evaluated in Python instead of SQL."""
    status_val = e.status.value if e.status else ""
    if e.disposable:
        return "unsafe"
    if status_val in EXPORT_SAFE_STATUSES and (e.role_based or e.catch_all):
        return "risky"
    if status_val in EXPORT_SAFE_STATUSES:
        return "safe"
    if status_val in EXPORT_RISKY_STATUSES:
        return "risky"
    if status_val in EXPORT_UNSAFE_STATUSES:
        return "unsafe"
    if status_val == "processing":
        return "processing"
    return "unsafe"


# Import the sync processor
from tasks.bulk_processor import (
    process_bulk_job_sync,
    verify_single_email_sync,
)

router = APIRouter(tags=["Bulk"])
logger = get_logger(__name__)


def _read_file(content: bytes, filename: str) -> pd.DataFrame:
    """Read CSV or Excel file into DataFrame (delegates to the shared reader)."""
    try:
        return read_upload_file(content, filename)
    except FileReadError as exc:
        logger.error(f"File read error: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))


def _detect_email_column(df: pd.DataFrame) -> str:
    """Auto detect email column from DataFrame (shared utility)."""
    try:
        return detect_email_column(df)
    except ValueError as exc:
        logger.warning(f"Email column detection failed: {str(exc)}")
        raise HTTPException(status_code=400, detail=str(exc))


def _count_unique_and_duplicates(df: pd.DataFrame, email_col: str) -> tuple[list[str], int]:
    """Normalize + dedupe emails in a DataFrame column.

    Returns (unique_emails, duplicate_emails_removed). Shared logic between
    this endpoint's upfront count (for the immediate upload response) and
    tasks/bulk_processor.py's own recomputation when the background job
    actually runs (kept as two separate computations rather than one shared
    call across the process boundary — background task re-reads the file
    from disk/S3 independently, same as before this change)."""
    series = df[email_col].dropna().astype(str).str.strip().str.lower()
    with_at = series[series.str.contains("@")]
    total_before_dedup = len(with_at)
    unique_emails = with_at.unique().tolist()
    duplicate_emails_removed = total_before_dedup - len(unique_emails)
    return unique_emails, duplicate_emails_removed


@router.post("/bulk-upload", response_model=BulkUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def bulk_upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Upload CSV or Excel file for bulk email verification."""
    try:
        filename = file.filename.lower()
        if not is_supported_filename(filename):
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

        # Count valid emails (normalise & deduplicate — mandatory bulk dedup)
        unique_emails, duplicate_emails_removed = _count_unique_and_duplicates(df, email_col)
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
            status=JobStatus.processing,
            current_stage='uploading',
            progress_percent=0,
            estimated_time_remaining=None,
            started_at=None,
            completed_at=None,
            error_details=None,
            total=total,
            duplicate_emails_removed=duplicate_emails_removed,
            created_at=utc_now_naive(),
        )
        db.add(job)
        await db.commit()

        # Bulk Upload Started notification — fired here (not inside the
        # background worker) so it fires exactly once per upload, right when
        # the job is actually queued/accepted.
        dup_note = f" ({duplicate_emails_removed} duplicate(s) skipped)" if duplicate_emails_removed else ""
        await async_create_notification(
            db,
            title="Bulk Upload Started",
            message=f'"{file.filename}" queued for verification — {total} email(s){dup_note}.',
            type=NotificationType.info,
            priority=NotificationPriority.low,
            metadata={
                "job_id": job_id,
                "file_name": file.filename,
                "total": total,
                "duplicate_emails_removed": duplicate_emails_removed,
            },
        )

        # Start processing the job in background using FastAPI BackgroundTasks
        logger.info("about_to_dispatch_bulk_job", job_id=job_id, email_col=email_col)
        background_tasks.add_task(process_bulk_job_sync, job_id, s3_key, email_col)
        logger.info("bulk_job_dispatched", job_id=job_id)

        return BulkUploadResponse(
            job_id=job_id,
            message="Job queued",
            total_emails=total,
            duplicate_emails_removed=duplicate_emails_removed,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in bulk_upload: {str(e)}", exc_info=True)
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
        logger.error(f"Error retrieving jobs: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve jobs: {str(e)}")

@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    try:
        job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")

        response = JobStatusResponse.model_validate(job)
        # unique_emails/total_emails_seen/cache_hit_rate are derived, not
        # stored columns — computed here from the stored counters.
        response.unique_emails = job.total
        response.total_emails_seen = job.total + (job.duplicate_emails_removed or 0)
        response.cache_hit_rate = round((job.reused_results / job.total * 100), 1) if job.total else 0.0
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving job {job_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve job: {str(e)}")


@router.post("/jobs/{job_id}/cancel", response_model=JobCancelResponse)
async def cancel_job(job_id: str, db: AsyncSession = Depends(get_db)):
    """
    Request graceful cancellation of a bulk job.

    This ONLY flips Job.cancel_requested — it does not itself stop anything.
    The background worker (tasks/bulk_processor.py) polls that flag between
    batches of in-flight verifications, stops submitting new work once it
    sees it, lets already-started verifications finish naturally (so their
    results are never lost or half-written), and then flips the job's
    `status` to 'cancelled' itself. Poll GET /jobs/{job_id} to observe that
    transition; this endpoint only confirms the request was accepted.

    Only jobs currently 'pending' or 'processing' can be cancelled — a
    completed/failed/already-cancelled job has nothing left to stop.
    """
    job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    if job.status not in (JobStatus.pending, JobStatus.processing):
        raise HTTPException(
            status_code=409,
            detail=f"Job cannot be cancelled — current status is '{job.status.value}'.",
        )

    job.cancel_requested = True
    await db.commit()

    logger.info("job_cancel_requested", job_id=job_id)

    return JobCancelResponse(
        message="Cancellation requested. The job will stop after in-flight emails finish.",
        job_id=job_id,
        status=job.status.value,
    )


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
        logger.error(f"Error deleting job {job_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete job: {str(e)}")

@router.get("/jobs/{job_id}/export")
async def export_job_results(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    filter_status: str = Query(default="all", alias="filter", description=f"One of {sorted(VALID_EXPORT_FILTERS)}"),
):
    """Export original file with verification results added as new columns.

    `filter` query param (all|safe|risky|unsafe) narrows the export down to
    only emails in that bucket — e.g. ?filter=safe downloads only Safe
    results instead of the whole job.
    """
    try:
        job = (await db.execute(select(Job).where(Job.job_id == job_id))).scalar_one_or_none()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found.")

        resolved_filter = filter_status if filter_status in VALID_EXPORT_FILTERS else "all"

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

        # Fetch verified results from DB (only for this job)
        emails_db = (await db.execute(select(Email).where(Email.job_id == job_id))).scalars().all()

        # Apply the safe/risky/unsafe filter BEFORE building the results
        # map, so both the "merge into original file" path and the
        # "fresh sheet" fallback path only ever see the matching rows.
        if resolved_filter != "all":
            emails_db = [e for e in emails_db if _email_export_bucket(e) == resolved_filter]

        results_map = {e.email: e for e in emails_db}

        if original_df is not None:
            # Add result columns to original sheet
            df = original_df.copy()
            emails_series = df[email_col].astype(str).str.strip().str.lower()

            if resolved_filter != "all":
                # Only keep rows whose email survived the bucket filter above.
                # (This also naturally drops "not_processed" rows when a
                # specific bucket was requested.)
                mask = emails_series.isin(results_map.keys())
                df = df[mask].copy()
                emails_series = emails_series[mask]

            df["ev_status"] = emails_series.map(lambda e: results_map[e].status.value if e in results_map else "not_processed")
            df["ev_score"] = emails_series.map(lambda e: results_map[e].score if e in results_map else "")
            df["ev_disposable"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].disposable else "No")
            df["ev_role_based"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].role_based else "No")
            df["ev_catch_all"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].catch_all else "No")
            df["ev_mx_found"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].mx_found else "No")
            df["ev_smtp_valid"] = emails_series.map(lambda e: "Yes" if e in results_map and results_map[e].smtp_valid else "No")
            df["ev_verified_at"] = emails_series.map(lambda e: str(results_map[e].verified_at) if e in results_map and results_map[e].verified_at else "")
        else:
            # Fallback fresh sheet — emails_db is already filtered above.
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

        filename_prefix = f"{resolved_filter}_" if resolved_filter != "all" else ""

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename_prefix}verified_{job.file_name}"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting job results for {job_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to export job results: {str(e)}")
