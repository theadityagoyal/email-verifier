"""
Shared timezone utilities for the email verifier project.

IMPORTANT: This project uses UTC for ALL database writes.
Timestamps are converted to IST (Asia/Kolkata) only at the presentation layer (frontend).

This module provides a single source of truth for getting the current UTC time
as a naive datetime (no timezone info), which is what our MySQL DATETIME columns expect.
"""
from datetime import datetime, timezone


def utc_now_naive() -> datetime:
    """
    Return the current UTC datetime as a naive datetime (tzinfo=None).

    This is the ONLY function that should be used for generating timestamps
    that will be written to the database (created_at, updated_at, verified_at,
    job timestamps, notification timestamps, etc.).

    All callers must use this function to ensure consistent UTC timestamps
    across the entire application (single verify, external API verify, bulk processing).
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)