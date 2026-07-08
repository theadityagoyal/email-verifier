"""Global ThreadPoolExecutor for blocking I/O operations (SMTP validation)."""
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from utils.config import settings

logger = logging.getLogger(__name__)

# Global executor - configurable via settings
_executor: Optional[ThreadPoolExecutor] = None


def init_executor(max_workers: Optional[int] = None) -> ThreadPoolExecutor:
    """
    Initialize the global ThreadPoolExecutor.

    Args:
        max_workers: Number of worker threads. If None, uses settings.SMTP_MAX_WORKERS

    Returns:
        ThreadPoolExecutor: The initialized executor instance

    Raises:
        ValueError: If max_workers is less than or equal to 0
    """
    global _executor
    if _executor is not None:
        logger.warning("Executor already initialized, returning existing instance")
        return _executor

    workers = max_workers or getattr(settings, 'SMTP_MAX_WORKERS', 20)
    if workers <= 0:
        raise ValueError(f"max_workers must be positive, got {workers}")

    _executor = ThreadPoolExecutor(
        max_workers=workers,
        thread_name_prefix="smtp-worker"
    )
    logger.info(f"SMTP executor initialized with {workers} workers")
    return _executor


def get_executor() -> ThreadPoolExecutor:
    """
    Get the global ThreadPoolExecutor instance.

    Returns:
        ThreadPoolExecutor: The global executor instance

    Raises:
        RuntimeError: If executor has not been initialized
    """
    if _executor is None:
        raise RuntimeError("Executor not initialized. Call init_executor() first.")
    return _executor


def is_executor_initialized() -> bool:
    """
    Check if the global executor has been initialized.

    Returns:
        bool: True if executor is initialized, False otherwise
    """
    return _executor is not None


def shutdown_executor(wait: bool = True) -> None:
    """
    Shutdown the global executor gracefully.

    Args:
        wait: If True, wait for all submitted tasks to complete before shutdown
    """
    global _executor
    if _executor is not None:
        logger.info(f"Shutting down SMTP executor (wait={wait}, active_threads={_executor._thread_name_prefix})")
        _executor.shutdown(wait=wait)
        _executor = None
        logger.info("SMTP executor shutdown complete")
    else:
        logger.warning("Attempted to shutdown executor that was not initialized")