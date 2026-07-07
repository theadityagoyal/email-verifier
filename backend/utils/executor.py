"""Global ThreadPoolExecutor for blocking I/O operations (SMTP validation)."""
from concurrent.futures import ThreadPoolExecutor

# Global executor - 20 workers = ~400-500 emails/min with 3s avg SMTP timeout
_executor = ThreadPoolExecutor(max_workers=20, thread_name_prefix="smtp-worker")


def get_executor() -> ThreadPoolExecutor:
    """Get the global ThreadPoolExecutor instance."""
    return _executor


def shutdown_executor(wait: bool = True):
    """Shutdown the global executor."""
    _executor.shutdown(wait=wait)