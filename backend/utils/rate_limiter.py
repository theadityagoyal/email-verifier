"""
Simple in-memory, fixed-window rate limiter for the external API.

NOTE: This is per-process. If the backend ever scales to multiple instances/
containers, each instance will track its own limits independently (so the
effective global limit becomes limit * instance_count). For a single-instance
deployment (current setup — see docker-compose.yml) this is accurate.
If you scale out horizontally later, swap this for a Redis-backed limiter.
"""
import time
import threading
from collections import defaultdict


class RateLimiter:
    def __init__(self):
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """
        Check whether `key` is allowed one more request under `limit` per
        `window_seconds`.

        Returns:
            (allowed: bool, retry_after_seconds: int)
        """
        now = time.time()
        with self._lock:
            timestamps = self._buckets[key]
            cutoff = now - window_seconds

            # Drop timestamps outside the current window
            while timestamps and timestamps[0] < cutoff:
                timestamps.pop(0)

            if len(timestamps) >= limit:
                retry_after = int(timestamps[0] + window_seconds - now) + 1
                return False, max(retry_after, 1)

            timestamps.append(now)
            return True, 0


# Separate limiters for verify (per-minute) and bulk (per-hour) so a burst
# of single verifications never eats into the bulk-upload quota or vice versa.
verify_rate_limiter = RateLimiter()
bulk_rate_limiter = RateLimiter()