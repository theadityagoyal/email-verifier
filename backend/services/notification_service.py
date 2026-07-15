"""
Centralized notification creation for the in-app notification system.

Every place in the app that wants to surface an event on the dashboard's
notification bell (bulk upload lifecycle, API key management, future system
errors, etc.) should call one of these two helpers instead of inserting into
the `notifications` table directly. This keeps defaults/shape consistent in
one place and is also the single spot that would need to change if
user/tenant-scoped notifications are added later (see Notification model
docstring in models/models.py).

Two variants are provided because the codebase already has two persistence
paths for the same kind of event:
  - `async_create_notification`: FastAPI request handlers (AsyncSession)
  - `sync_create_notification`:  ThreadPoolExecutor background workers
                                  (tasks/bulk_processor.py, sync Session)

Both are best-effort: a notification failure must never break the actual
request/job it's describing — same pattern already used for domain
bookkeeping in services/domain_service.py and usage logging in
utils/usage_logger.py.
"""
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from models.models import Notification, NotificationType, NotificationPriority
from utils.logging import get_logger

logger = get_logger(__name__)


def _build_notification(
    title: str,
    message: str,
    type: NotificationType,
    priority: NotificationPriority,
    metadata: Optional[dict],
) -> Notification:
    return Notification(
        title=title,
        message=message,
        type=type,
        priority=priority,
        is_read=False,
        extra_data=metadata,
    )


async def async_create_notification(
    db: AsyncSession,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    priority: NotificationPriority = NotificationPriority.medium,
    metadata: Optional[dict] = None,
) -> None:
    """Create a notification from an async FastAPI request handler."""
    try:
        db.add(_build_notification(title, message, type, priority, metadata))
        await db.commit()
        logger.info("notification_created", title=title, type=type.value)
    except Exception as exc:
        await db.rollback()
        logger.warning("notification_create_failed", title=title, error=str(exc))


def sync_create_notification(
    db: Session,
    title: str,
    message: str,
    type: NotificationType = NotificationType.info,
    priority: NotificationPriority = NotificationPriority.medium,
    metadata: Optional[dict] = None,
) -> None:
    """Create a notification from sync code (ThreadPoolExecutor workers,
    e.g. tasks/bulk_processor.py)."""
    try:
        db.add(_build_notification(title, message, type, priority, metadata))
        db.commit()
        logger.info("notification_created", title=title, type=type.value)
    except Exception as exc:
        db.rollback()
        logger.warning("notification_create_failed", title=title, error=str(exc))
