"""
API key generation and hashing utilities for the external developer API.
Keys are shown to the user ONLY ONCE at creation time (like Stripe/GitHub).
We store only the SHA-256 hash in the database — never the plaintext key.
"""
import secrets
import hashlib

KEY_PREFIX = "evp"  # EmailVerifier Pro


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate a new API key.

    Returns:
        tuple: (full_key, key_hash, key_prefix)
            full_key: the plaintext key to show the user ONCE (e.g. "evp_a1b2c3...")
            key_hash: SHA-256 hex digest to store in the DB
            key_prefix: short prefix stored in DB for display/lookup (e.g. "evp_a1b2c3d4")
    """
    raw = secrets.token_hex(24)  # 48 hex chars of entropy
    full_key = f"{KEY_PREFIX}_{raw}"
    key_hash = hash_api_key(full_key)
    key_prefix = full_key[:16]  # "evp_" + first 12 hex chars, safe to display/log
    return full_key, key_hash, key_prefix


def hash_api_key(key: str) -> str:
    """Hash a plaintext API key for DB lookup/storage."""
    return hashlib.sha256(key.encode("utf-8")).hexdigest()