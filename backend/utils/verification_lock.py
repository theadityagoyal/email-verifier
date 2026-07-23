"""
Per-email lock manager — prevents duplicate DNS/MX/SMTP work when the same
email address is submitted for verification concurrently (two overlapping
single-verify requests, two overlapping bulk jobs, or a mix of both).

Why threading.Lock and not asyncio.Lock:
  Bulk processing (tasks/bulk_processor.py) runs on a ThreadPoolExecutor
  where each worker THREAD owns its own asyncio event loop (see
  _get_thread_event_loop() there). asyncio.Lock is bound to the event loop
  it was created on and cannot be safely shared/awaited across different
  loops running in different threads. threading.Lock has no such
  restriction — it works correctly across threads and event loops.

  To avoid blocking an event loop's single thread while waiting on a
  threading.Lock, acquisition is always done via asyncio.to_thread(), which
  runs the blocking .acquire() call on a separate worker thread and lets
  the calling coroutine's event loop keep servicing other work meanwhile.

Refcounted cleanup:
  Without cleanup, this dict would grow by one entry per unique email address
  ever verified, for the lifetime of the process — effectively an unbounded
  memory leak for a SaaS processing millions of addresses. Each lock entry
  tracks how many callers currently want it; the entry is removed from the
  dict the moment the last holder releases it (and no one else grabbed a
  reference to the same dict slot in between, guarded by _guard).
"""
import asyncio
import threading
from dataclasses import dataclass, field


@dataclass
class _RefCountedLock:
    lock: threading.Lock = field(default_factory=threading.Lock)
    refcount: int = 0


class EmailLockManager:
    """Keyed mutual-exclusion lock, one lock per (normalized) email string."""

    def __init__(self) -> None:
        self._locks: dict[str, _RefCountedLock] = {}
        self._guard = threading.Lock()

    def _acquire_sync(self, key: str) -> _RefCountedLock:
        with self._guard:
            entry = self._locks.get(key)
            if entry is None:
                entry = _RefCountedLock()
                self._locks[key] = entry
            entry.refcount += 1
        entry.lock.acquire()  # blocks (this call runs off the event loop thread)
        return entry

    def _release_sync(self, key: str, entry: _RefCountedLock) -> None:
        entry.lock.release()
        with self._guard:
            entry.refcount -= 1
            if entry.refcount <= 0 and self._locks.get(key) is entry:
                del self._locks[key]

    async def acquire(self, key: str) -> _RefCountedLock:
        """Acquire the lock for `key`, waiting if another coroutine/thread
        already holds it. Returns an opaque token to pass to release()."""
        return await asyncio.to_thread(self._acquire_sync, key)

    async def release(self, key: str, entry: _RefCountedLock) -> None:
        """Release a lock previously returned by acquire()."""
        await asyncio.to_thread(self._release_sync, key, entry)

    def active_lock_count(self) -> int:
        """Diagnostic helper — number of email keys currently locked/waited-on."""
        with self._guard:
            return len(self._locks)


# Process-wide singleton — shared by every verification path (single verify,
# external API verify, bulk workers) since they all import this module.
email_lock_manager = EmailLockManager()
