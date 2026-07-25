from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time

from api.v1.router import api_router
from api.external.v1.router import api_external_router
from utils.config import settings
from utils.logging import configure_logging, get_logger
from utils.executor import get_executor, shutdown_executor, init_executor
from models.database import check_database_connection, AsyncSessionLocal


configure_logging()
logger = get_logger(__name__)

from tasks.retry_scheduler import start_retry_scheduler, stop_retry_scheduler


async def _reconcile_orphaned_jobs() -> None:
    """
    FIX (stuck-at-Processing audit): if the process crashed/restarted while
    a bulk job was mid-flight (pending/processing), that job's row was left
    in a non-terminal state forever — nothing in the normal flow ever
    revisits it, so the UI shows it stuck at "Processing" indefinitely even
    though no worker is actually touching it anymore.

    On every startup, any job still in 'pending' or 'processing' is, by
    definition, orphaned (a genuinely in-flight job can only exist while
    THIS process is alive — bulk jobs are ThreadPoolExecutor-based, not
    persisted across restarts). Mark them 'failed' with a clear message so
    the UI reflects reality and the user can re-upload.
    """
    from sqlalchemy import select, update
    from models.models import Job, JobStatus

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Job.job_id).where(Job.status.in_([JobStatus.pending, JobStatus.processing]))
            )
            orphaned_ids = [row[0] for row in result.all()]

            if not orphaned_ids:
                logger.info("no_orphaned_jobs_found_on_startup")
                return

            from utils.timezone import utc_now_naive
            now = utc_now_naive()

            await session.execute(
                update(Job)
                .where(Job.job_id.in_(orphaned_ids))
                .values(
                    status=JobStatus.failed,
                    error_message="Job was interrupted by a server restart and could not be resumed. Please re-upload.",
                    completed_at=now,
                    current_stage='failed',
                )
            )
            await session.commit()
            logger.warning(
                "orphaned_jobs_reconciled_on_startup",
                count=len(orphaned_ids),
                job_ids=orphaned_ids[:20],  # cap log size
            )
    except Exception as exc:
        logger.error("orphaned_job_reconciliation_failed", error=str(exc), exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize executor
    init_executor()
    executor = get_executor()
    logger.info("application_startup", workers=executor._max_workers)

    # Check database connection
    db_connected = await check_database_connection()
    if not db_connected:
        logger.warning("database_connection_failed_on_startup")
    else:
        logger.info("database_connection_verified")

    # FIX: clean up any jobs left mid-flight by a previous crash/restart —
    # closes the "stuck at Processing forever" bug at its root.
    if db_connected:
        await _reconcile_orphaned_jobs()

    # Check for weak default configurations
    warnings = []

    if settings.SECRET_KEY == "change-me-in-production":
        warnings.append("SECRET_KEY is still set to the default value. This is a security risk!")

    if settings.ADMIN_PASSWORD == "change-me-admin-password":
        warnings.append("ADMIN_PASSWORD is still set to the default value. This is a security risk!")

    if settings.DEBUG:
        warnings.append("DEBUG mode is enabled. This should be disabled in production!")

    origins = settings.cors_origins_list
    if "*" in origins or (len(origins) == 1 and origins[0] in ["*", "http://*", "https://*"]):
        warnings.append("CORS configuration is too permissive (allows all origins). This is a security risk!")

    for warning in warnings:
        logger.warning(f"weak_default_detected: {warning}")

    if not warnings:
        logger.info("no_weak_defaults_detected")

    start_retry_scheduler()

    yield
    logger.info("application_shutdown")
    shutdown_executor(wait=True)
    stop_retry_scheduler(wait=True)


app = FastAPI(
    title="Email Verification System",
    description="Production-ready email verification API with bulk processing and analytics",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    response.headers["X-Process-Time-Ms"] = str(duration)
    logger.info("request", method=request.method, path=request.url.path, ms=duration)
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("unhandled_exception", path=request.url.path, error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."},
    )


app.include_router(api_router)
app.include_router(api_external_router)


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}