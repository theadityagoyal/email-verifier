"""
Database configuration and session management for the email verification application

This module provides:
- Async and synchronous database engines
- Session factories for both async (FastAPI) and sync (Alembic/background tasks) usage
- Database session dependency for FastAPI dependency injection
- Connection health checking
- Proper connection pooling and error handling
"""

import logging
from typing import AsyncGenerator, Generator
from urllib.parse import urlparse, urlunparse

from sqlalchemy import create_engine
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
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
async_engine: AsyncEngine = create_async_engine(
    get_async_database_url(),
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=settings.DB_POOL_RECYCLE,
    echo=settings.DEBUG and settings.DEBUG_SQL,  # Separate SQL echo control
)

# Sync Engine (Alembic / Background Tasks)
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