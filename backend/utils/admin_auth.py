"""
Stateless admin authentication for the API Keys management dashboard.

Uses a signed HMAC token (stdlib only — no JWT library needed):
    token = base64url(json({"exp": <unix_ts>})) + "." + hmac_sha256(payload, SECRET_KEY)

Valid for 24 hours from issuance. Verified via the `require_admin` dependency,
which reads the `X-Admin-Token` header on every admin-only endpoint.
"""
import base64
import hashlib
import hmac
import json
import time 

from fastapi import Header, HTTPException, status

from utils.config import settings

TOKEN_VALIDITY_SECONDS = 24 * 60 * 60  # 24 hours


def _sign(payload_b64: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def create_admin_token() -> str:
    """Issue a new admin token valid for TOKEN_VALIDITY_SECONDS."""
    payload = {"exp": int(time.time()) + TOKEN_VALIDITY_SECONDS}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("utf-8").rstrip("=")
    signature = _sign(payload_b64)
    return f"{payload_b64}.{signature}"


def verify_admin_token_string(token: str) -> bool:
    """Validate signature + expiry of a raw token string."""
    if not token or "." not in token:
        return False

    payload_b64, _, signature = token.partition(".")
    expected_signature = _sign(payload_b64)

    if not hmac.compare_digest(signature, expected_signature):
        return False

    try:
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("utf-8")))
    except Exception:
        return False

    exp = payload.get("exp", 0)
    if not isinstance(exp, (int, float)) or exp < time.time():
        return False

    return True


async def require_admin(x_admin_token: str | None = Header(default=None, alias="X-Admin-Token")) -> bool:
    """FastAPI dependency — raises 401 if the admin token is missing/invalid/expired."""
    if not x_admin_token or not verify_admin_token_string(x_admin_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired admin token",
        )
    return True
