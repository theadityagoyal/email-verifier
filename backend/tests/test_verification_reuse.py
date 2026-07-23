"""
Tests for smart verification result reuse:
  - TTL freshness decision (pure function, no I/O)
  - EmailLockManager mutual exclusion + refcounted cleanup
  - Bulk-upload dedup counting

These deliberately avoid mocking DNS/SMTP/DB for the full verify_email()
pipeline (out of scope for this round — heavy integration-test territory).
"""
import threading
import time
from datetime import timedelta

import pandas as pd
import pytest

from services.email_service import _is_fresh
from utils.timezone import utc_now_naive
from utils.verification_lock import EmailLockManager
from api.v1.endpoints.bulk import _count_unique_and_duplicates


# ── _is_fresh ────────────────────────────────────────────────────────────────

class TestIsFresh:
    def test_none_checked_at_is_never_fresh(self):
        now = utc_now_naive()
        assert _is_fresh(None, 30, now) is False

    def test_within_ttl_is_fresh(self):
        now = utc_now_naive()
        checked_at = now - timedelta(days=10)
        assert _is_fresh(checked_at, 30, now) is True

    def test_exactly_at_ttl_boundary_is_not_fresh(self):
        now = utc_now_naive()
        checked_at = now - timedelta(days=30)
        # (now - checked_at) < ttl -> 30 days < 30 days -> False (boundary excluded)
        assert _is_fresh(checked_at, 30, now) is False

    def test_expired_is_not_fresh(self):
        now = utc_now_naive()
        checked_at = now - timedelta(days=61)
        assert _is_fresh(checked_at, 60, now) is False

    def test_smtp_ttl_shorter_than_dns_ttl(self):
        now = utc_now_naive()
        checked_at = now - timedelta(days=45)
        # Fresh under a 60-day (DNS/MX) TTL...
        assert _is_fresh(checked_at, 60, now) is True
        # ...but stale under a 30-day (SMTP) TTL, same timestamp.
        assert _is_fresh(checked_at, 30, now) is False


# ── EmailLockManager ─────────────────────────────────────────────────────────

class TestEmailLockManager:
    @pytest.mark.asyncio
    async def test_acquire_release_roundtrip(self):
        mgr = EmailLockManager()
        entry = await mgr.acquire("user@example.com")
        assert mgr.active_lock_count() == 1
        await mgr.release("user@example.com", entry)
        assert mgr.active_lock_count() == 0

    @pytest.mark.asyncio
    async def test_sequential_acquire_release_same_key(self):
        """Two non-overlapping acquire/release cycles for the same key must
        not deadlock (threading.Lock is not reentrant, but sequential
        release-then-acquire is fine)."""
        mgr = EmailLockManager()
        e1 = await mgr.acquire("dup@example.com")
        await mgr.release("dup@example.com", e1)
        e2 = await mgr.acquire("dup@example.com")
        await mgr.release("dup@example.com", e2)
        assert mgr.active_lock_count() == 0

    @pytest.mark.asyncio
    async def test_different_keys_do_not_block_each_other(self):
        mgr = EmailLockManager()
        e1 = await mgr.acquire("a@example.com")
        e2 = await mgr.acquire("b@example.com")  # different key — must not block
        assert mgr.active_lock_count() == 2
        await mgr.release("a@example.com", e1)
        await mgr.release("b@example.com", e2)

    def test_mutual_exclusion_across_threads(self):
        """Two threads racing for the SAME key: only one should be
        'inside the critical section' at a time. Verified via a shared
        counter that would exceed 1 if both threads entered concurrently."""
        mgr = EmailLockManager()
        key = "race@example.com"
        concurrent_count = {"value": 0, "max_seen": 0}
        guard = threading.Lock()

        def worker():
            entry = mgr._acquire_sync(key)
            with guard:
                concurrent_count["value"] += 1
                concurrent_count["max_seen"] = max(concurrent_count["max_seen"], concurrent_count["value"])
            time.sleep(0.05)  # hold the lock briefly to widen the race window
            with guard:
                concurrent_count["value"] -= 1
            mgr._release_sync(key, entry)

        threads = [threading.Thread(target=worker) for _ in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert concurrent_count["max_seen"] == 1, "more than one thread held the lock simultaneously"
        assert mgr.active_lock_count() == 0, "lock entry was not cleaned up after all releases"

    def test_refcounted_cleanup_does_not_evict_while_waiter_pending(self):
        """If thread A holds the lock and thread B is waiting on the same
        key, the dict entry must NOT be deleted out from under B."""
        mgr = EmailLockManager()
        key = "wait@example.com"
        released_by_a = threading.Event()
        b_acquired = threading.Event()

        def holder():
            entry = mgr._acquire_sync(key)
            time.sleep(0.1)
            mgr._release_sync(key, entry)
            released_by_a.set()

        def waiter():
            entry = mgr._acquire_sync(key)  # blocks until holder releases
            b_acquired.set()
            mgr._release_sync(key, entry)

        t_a = threading.Thread(target=holder)
        t_b = threading.Thread(target=waiter)
        t_a.start()
        time.sleep(0.02)  # ensure A grabs the lock first
        t_b.start()
        t_a.join(timeout=2)
        t_b.join(timeout=2)

        assert released_by_a.is_set()
        assert b_acquired.is_set()
        assert mgr.active_lock_count() == 0


# ── Bulk dedup counting ──────────────────────────────────────────────────────

class TestBulkDedup:
    def test_no_duplicates(self):
        df = pd.DataFrame({"email": ["a@x.com", "b@x.com", "c@x.com"]})
        unique, removed = _count_unique_and_duplicates(df, "email")
        assert sorted(unique) == ["a@x.com", "b@x.com", "c@x.com"]
        assert removed == 0

    def test_exact_duplicates_removed(self):
        df = pd.DataFrame({"email": ["a@x.com", "a@x.com", "b@x.com"]})
        unique, removed = _count_unique_and_duplicates(df, "email")
        assert sorted(unique) == ["a@x.com", "b@x.com"]
        assert removed == 1

    def test_case_and_whitespace_normalized_before_dedup(self):
        df = pd.DataFrame({"email": [" A@X.com", "a@x.com ", "A@x.COM"]})
        unique, removed = _count_unique_and_duplicates(df, "email")
        assert unique == ["a@x.com"]
        assert removed == 2

    def test_rows_without_at_sign_excluded_not_counted_as_duplicates(self):
        df = pd.DataFrame({"email": ["a@x.com", "not-an-email", "b@x.com"]})
        unique, removed = _count_unique_and_duplicates(df, "email")
        assert sorted(unique) == ["a@x.com", "b@x.com"]
        assert removed == 0

    def test_blank_rows_ignored(self):
        df = pd.DataFrame({"email": ["a@x.com", None, "", "a@x.com"]})
        unique, removed = _count_unique_and_duplicates(df, "email")
        assert unique == ["a@x.com"]
        assert removed == 1

    def test_bulk_1000_then_bulk_with_800_repeats_scenario(self):
        """Mirrors the spec's worked example structurally (scaled down):
        a second batch containing mostly-already-seen addresses dedupes
        correctly within itself; cross-batch reuse is verify_email()'s job,
        not this function's — this only tests within-one-file dedup."""
        first_batch = [f"user{i}@example.com" for i in range(100)]
        second_batch = first_batch[:80] + [f"newuser{i}@example.com" for i in range(20)]
        # second_batch itself has no internal duplicates -> removed should be 0
        df = pd.DataFrame({"email": second_batch})
        unique, removed = _count_unique_and_duplicates(df, "email")
        assert len(unique) == 100
        assert removed == 0

        # But if the second batch itself contains repeats, they're caught:
        second_batch_with_repeats = second_batch + second_batch[:10]
        df2 = pd.DataFrame({"email": second_batch_with_repeats})
        unique2, removed2 = _count_unique_and_duplicates(df2, "email")
        assert len(unique2) == 100
        assert removed2 == 10
