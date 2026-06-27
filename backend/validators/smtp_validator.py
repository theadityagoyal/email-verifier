import smtplib
import socket
import asyncio
import random
import string
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

SENDER_EMAIL = "verify@emailchecker.com"
HELO_DOMAIN = "emailchecker.com"


def _random_email(domain: str) -> str:
    chars = string.ascii_lowercase + string.digits
    local = "".join(random.choices(chars, k=12))
    return f"{local}@{domain}"


def _smtp_check(email: str, mx_host: str, timeout: int) -> tuple[bool, bool]:
    try:
        with smtplib.SMTP(timeout=timeout) as server:
            server.connect(mx_host, 25)
            # Set socket timeout for subsequent operations
            server.sock.settimeout(timeout)
            server.helo(HELO_DOMAIN)
            server.mail(SENDER_EMAIL)
            code, _ = server.rcpt(email)
            smtp_valid = (code == 250)
            # Catch-all probe
            code2, _ = server.rcpt(_random_email(email.split("@")[1]))
            catch_all = (code2 == 250)
            return smtp_valid, catch_all
    except (socket.timeout, smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected, ConnectionRefusedError):
        return False, False
    except smtplib.SMTPRecipientsRefused:
        return False, False
    except Exception as exc:
        logger.debug("smtp_error", mx=mx_host, error=str(exc))
        return False, False


def verify_smtp(email: str, mx_records: list[str]) -> tuple[bool, bool]:
    if not mx_records:
        return False, False
    # Try only top 2 MX
    for mx in mx_records[:2]:
        try:
            result = _smtp_check(email, mx, settings.SMTP_TIMEOUT)
            if result[0]:
                return result
        except Exception:
            continue
    return False, False


async def async_verify_smtp(email: str, mx_records: list[str]) -> tuple[bool, bool]:
    return await asyncio.to_thread(verify_smtp, email, mx_records)