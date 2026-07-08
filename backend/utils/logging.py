import logging
import sys
from typing import Any

import structlog
from structlog import dev, processors, stdlib
from utils.config import settings


def configure_logging() -> None:
    """
    Configure application logging with structlog.

    In debug mode (settings.DEBUG=True), uses human-readable colored output.
    In production mode, uses JSON format for log aggregation.
    """
    log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    # Configure standard library logging to work with structlog
    # We use a simple format since structlog handles the actual formatting
    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        stream=sys.stdout,
    )

    # Choose renderer based on environment
    if settings.DEBUG:
        # Development: colorful, human-readable console output
        renderers = [
            stdlib.filter_by_level,
            stdlib.add_logger_name,
            stdlib.add_log_level,
            stdlib.PositionalArgumentsFormatter(),
            processors.TimeStamper(fmt="%Y-%m-%d %H:%M.%S"),
            processors.StackInfoRenderer(),
            processors.format_exc_info,
            dev.ConsoleRenderer(colors=True),
        ]
    else:
        # Production: JSON output for log aggregation
        renderers = [
            stdlib.filter_by_level,
            stdlib.add_logger_name,
            stdlib.add_log_level,
            stdlib.PositionalArgumentsFormatter(),
            processors.TimeStamper(fmt="iso"),
            processors.StackInfoRenderer(),
            processors.format_exc_info,
            processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=renderers,
        context_class=dict,
        logger_factory=stdlib.LoggerFactory(),
        wrapper_class=stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.BoundLogger:
    """
    Get a configured structlog logger.

    Args:
        name: Logger name, typically __name__ of the module

    Returns:
        structlog.BoundLogger: Configured logger instance
    """
    return structlog.get_logger(name)
