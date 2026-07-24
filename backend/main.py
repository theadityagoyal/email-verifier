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
from models.database import check_database_connection


configure_logging()
logger = get_logger(__name__)

# Import retry scheduler functions
from tasks.retry_scheduler import start_retry_scheduler, stop_retry_scheduler


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

    # Check for weak default configurations
    warnings = []

    # Check for weak SECRET_KEY
    if settings.SECRET_KEY == "change-me-in-production":
        warnings.append("SECRET_KEY is still set to the default value. This is a security risk!")

    # Check for weak ADMIN_PASSWORD
    if settings.ADMIN_PASSWORD == "change-me-admin-password":
        warnings.append("ADMIN_PASSWORD is still set to the default value. This is a security risk!")

    # Check if debug mode is enabled in production-like environment
    if settings.DEBUG:
        warnings.append("DEBUG mode is enabled. This should be disabled in production!")

    # Check if CORS is too permissive (if it contains wildcards or is too broad)
    origins = settings.cors_origins_list
    if "*" in origins or (len(origins) == 1 and origins[0] in ["*", "http://*", "https://*"]):
        warnings.append("CORS configuration is too permissive (allows all origins). This is a security risk!")

    # Log any warnings
    for warning in warnings:
        logger.warning(f"weak_default_detected: {warning}")

    if not warnings:
        logger.info("no_weak_defaults_detected")

    # Start greylist retry scheduler (Phase 4)
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

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    response.headers["X-Process-Time-Ms"] = str(duration)
    logger.info("request", method=request.method, path=request.url.path, ms=duration)
    return response


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # exc_info=True is the whole point of this handler existing — without it
    # every unhandled crash in production logged only str(exc) (e.g. just
    # "division by zero") with zero indication of *where* it happened,
    # making these effectively undebuggable from logs alone.
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
