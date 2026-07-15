from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from models.database import get_db
from models.models import Notification
from schemas.schemas import (
    PaginatedNotificationsResponse,
    NotificationItem,
    UnreadCountResponse,
    NotificationActionResponse,
)
from utils.logging import get_logger

router = APIRouter(prefix="/notifications", tags=["Notifications"])
logger = get_logger(__name__)


def _to_item(n: Notification) -> NotificationItem:
    """Explicit field mapping — `extra_data` (ORM/DB) -> `metadata` (API),
    since the names differ and Pydantic's from_attributes won't bridge that
    automatically."""
    return NotificationItem(
        id=n.id,
        title=n.title,
        message=n.message,
        type=n.type,
        priority=n.priority,
        is_read=n.is_read,
        metadata=n.extra_data,
        created_at=n.created_at,
        updated_at=n.updated_at,
    )


async def _unread_count(db: AsyncSession) -> int:
    result = await db.execute(
        select(func.count()).select_from(
            select(Notification.id).where(Notification.is_read.is_(False)).subquery()
        )
    )
    return result.scalar_one()


@router.get("", response_model=PaginatedNotificationsResponse)
async def list_notifications(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    unread_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    """Newest-first, with unread notifications surfaced ahead of read ones
    regardless of age (matches the dropdown's "unread first" requirement)."""
    query = select(Notification)
    if unread_only:
        query = query.where(Notification.is_read.is_(False))

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    unread_count = await _unread_count(db)

    offset = (page - 1) * size
    rows = (
        await db.execute(
            query.order_by(
                Notification.is_read.asc(),   # unread (0) before read (1)
                Notification.created_at.desc(),
                Notification.id.desc(),
            )
            .offset(offset)
            .limit(size)
        )
    ).scalars().all()

    return PaginatedNotificationsResponse(
        items=[_to_item(n) for n in rows],
        total=total,
        unread_count=unread_count,
        page=page,
        size=size,
        pages=(total + size - 1) // size if total else 0,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(db: AsyncSession = Depends(get_db)):
    return UnreadCountResponse(unread_count=await _unread_count(db))


@router.post("/read-all", response_model=NotificationActionResponse)
async def mark_all_read(db: AsyncSession = Depends(get_db)):
    # IMPORTANT: this route must be declared before "/{notification_id}/read"
    # would ever ambiguously match — it doesn't here since the path shapes
    # differ, but kept first for readability/grouping with the other bulk
    # action below.
    result = await db.execute(
        update(Notification).where(Notification.is_read.is_(False)).values(is_read=True)
    )
    await db.commit()
    return NotificationActionResponse(message="all_marked_read", count=result.rowcount)


@router.delete("/clear-all", response_model=NotificationActionResponse)
async def clear_all_notifications(db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(Notification))
    await db.commit()
    logger.info("notifications_cleared_all", count=result.rowcount)
    return NotificationActionResponse(message="all_deleted", count=result.rowcount)


@router.post("/{notification_id}/read", response_model=NotificationActionResponse)
async def mark_notification_read(notification_id: int, db: AsyncSession = Depends(get_db)):
    n = (
        await db.execute(select(Notification).where(Notification.id == notification_id))
    ).scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    n.is_read = True
    await db.commit()
    return NotificationActionResponse(message="marked_read", id=notification_id)


@router.delete("/{notification_id}", response_model=NotificationActionResponse)
async def delete_notification(notification_id: int, db: AsyncSession = Depends(get_db)):
    n = (
        await db.execute(select(Notification).where(Notification.id == notification_id))
    ).scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await db.delete(n)
    await db.commit()
    return NotificationActionResponse(message="deleted", id=notification_id)
