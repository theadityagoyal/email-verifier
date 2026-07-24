"""
Database configuration and session management for the email verification application

This module provides: 
- Async and synchronous database engines
- Session factories for both async (FastAPI) and sync (Alembic/background tasks) usage
- Database session dependency for FastAPI dependency injection
- Connection health checking
- Proper connection pooling and error handling

IMPORTANT (fix — 2026-07-24): the async engine now uses NullPool.

Root cause: tasks/bulk_processor.py runs email verification on a
ThreadPoolExecutor, and each worker THREAD creates and reuses its own
asyncio event loop (_get_thread_event_loop()). services/email_service.py
uses the SAME shared `async_engine`/AsyncSessionLocal on both the main
FastAPI event loop AND those per-thread loops.

aiomysql connections are bound to the event loop that created them. With a
normal pooled engine, a connection opened on a worker-thread's loop was
being returned to the shared pool and later checked out by a request
running on the MAIN event loop (e.g. GET /jobs, /notifications,
/dashboard/stats) — causing:

    got Future <Future pending> attached to a different loop

...which crashed those endpoints with 500s, and — as a side effect — also
caused in-flight bulk verifications to fail/never persist, leaving emails
stuck in "processing" status.

NullPool disables pooling for the async engine: every checkout opens a
brand new aiomysql connection and closes it when the session ends, so a
connection is NEVER reused across different event loops. This is the
correct fix given the current single-shared-engine, multi-event-loop
architecture (see bulk_processor.py's thread-local loop reuse). The sync
engine is untouched — SyncSessionLocal/sync psycopg-style connections have
no event-loop affinity, so pooling there is fine and unaffected.
"""

import logging
from typing import AsyncGenerator, Generator
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import sessionmaker, Session

from utils.config import settings

logger = logging.getLogger(__name__)


def get_async_database_url() -> str:
    """
    Convert synchronous database URL to asynchronous equivalent.

    Handles conversion from mysql+pymysql:// to mysql+aiomysql://
    while preserving all other URL components.
    """
    url = urlparse(settings.DATABASE_URL)

    # Convert to async driver for MySQL
    if url.scheme == "mysql+pymysql":
        return urlunparse(("mysql+aiomysql",) + url[1:])

    # For other databases or if already async, return as-is
    return settings.DATABASE_URL


# Async Engine (FastAPI)
#
# NullPool: see module docstring above. This is REQUIRED because this
# engine is used from multiple independent asyncio event loops in this
# codebase (main FastAPI loop + per-thread loops in
# tasks/bulk_processor.py's ThreadPoolExecutor). pool_size/max_overflow/
# pool_timeout/pool_recycle are meaningless under NullPool (no pool exists)
# and are intentionally omitted here to avoid implying they still apply.
async_engine: AsyncEngine = create_async_engine(
    get_async_database_url(),
    poolclass=NullPool,
    echo=settings.DEBUG and settings.DEBUG_SQL,  # Separate SQL echo control
)

# Sync Engine (Alembic / Background Tasks)
# Unaffected by the fix above — sync DB-API connections have no event-loop
# affinity, so normal pooling here is safe and unchanged.
sync_engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    echo=settings.DEBUG and settings.DEBUG_SQL,
)

# Session factories
AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency that provides an async database session for FastAPI endpoints.

    Yields a session and ensures proper cleanup:
    - Commits transaction on success
    - Rolls back on any exception
    - Always closes the session

    Yields:
        AsyncSession: Database session

    Raises:
        SQLAlchemyError: For database-related errors
        Exception: For unexpected errors (after rollback)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
            logger.debug("Database session committed successfully")
        except SQLAlchemyError as e:
            await session.rollback()
            logger.error(f"Database error in session: {str(e)}", exc_info=True)
            raise
        except Exception as e:
            await session.rollback()
            logger.error(f"Unexpected error in database session: {str(e)}", exc_info=True)
            raise
        finally:
            await session.close()
            logger.debug("Database session closed")


def get_sync_db() -> Generator[Session, None, None]:
    """
    Provides a synchronous database session for Alembic migrations and background tasks.

    Yields a session and ensures proper cleanup:
    - Commits transaction on success
    - Rolls back on any exception
    - Always closes the session

    Yields:
        Session: Database session

    Raises:
        SQLAlchemyError: For database-related errors
        Exception: For unexpected errors (after rollback)
    """
    db = SyncSessionLocal()
    try:
        yield db
        db.commit()
        logger.debug("Sync database session committed successfully")
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error in sync session: {str(e)}", exc_info=True)
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Unexpected error in sync database session: {str(e)}", exc_info=True)
        raise
    finally:
        db.close()
        logger.debug("Sync database session closed")


async def check_database_connection() -> bool:
    """
    Verify database connectivity on application startup.

    Returns:
        bool: True if connection successful, False otherwise
    """
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        logger.info("Database connection successful")
        return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False