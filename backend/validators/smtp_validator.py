import smtplib
import socket
import asyncio
import random
import string
from typing import Tuple, List, Optional
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# Configuration from settings with fallbacks
SENDER_EMAIL = getattr(settings, 'SMTP_SENDER_EMAIL', "verify@emailchecker.com")
HELO_DOMAIN = getattr(settings, 'SMTP_HELO_DOMAIN', "emailchecker.com")
SMTP_TIMEOUT = getattr(settings, 'SMTP_TIMEOUT', 10)
SMTP_RETRIES = getattr(settings, 'SMTP_RETRIES', 2)
SMTP_MAX_MX_TO_TRY = getattr(settings, 'SMTP_MAX_MX_TO_TRY', 3)


def _is_permanent_error(smtp_code: int) -> bool:
    """Determine if an SMTP status code indicates a permanent failure."""
    # 5xx errors are permanent (except 551 which might be temporary in some cases, but we treat as permanent)
    return 500 <= smtp_code < 600


def _is_temporary_error(smtp_code: int) -> bool:
    """Determine if an SMTP status code indicates a temporary failure."""
    # 4xx errors are temporary
    return 400 <= smtp_code < 500


def _random_email(domain: str) -> str:
    """Generate a random email address for the given domain to test catch-all."""
    chars = string.ascii_lowercase + string.digits
    local = "".join(random.choices(chars, k=12))
    return f"{local}@{domain}"


def _smtp_check(email: str, mx_host: str, timeout: int) -> tuple[bool, bool]:
    """
    Perform SMTP check on a single MX host.

    Returns:
        tuple: (smtp_valid, catch_all) where:
            smtp_valid: True if the email address was accepted by the server
            catch_all: True if a random email at the domain was accepted (indicating catch-all)

    Raises:
        Exception: For temporary errors that should be retried (e.g., connection issues, 4xx responses)
    """
    try:
        with smtplib.SMTP(timeout=timeout) as server:
            server.connect(mx_host, 25)
            # Set socket timeout for subsequent operations
            server.sock.settimeout(timeout)
            server.helo(HELO_DOMAIN)
            server.mail(SENDER_EMAIL)
            code, _ = server.rcpt(email)
            smtp_valid = (code == 250)

            # Catch-all probe: send a random email to the same domain
            code2, _ = server.rcpt(_random_email(email.split("@")[1]))
            catch_all = (code2 == 250)

            return smtp_valid, catch_all
    except (socket.timeout, smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected, ConnectionRefusedError) as e:
        # Connection-related errors are temporary - retry with next attempt or next MX
        logger.debug("smtp_connection_error", mx=mx_host, error=str(e))
        raise  # Re-raise to trigger retry
    except smtplib.SMTPRecipientsRefused as e:
        # Recipient refused - permanent error (e.g., mailbox does not exist)
        logger.debug("smtp_recipient_refused", mx=mx_host, error=str(e))
        return False, False
    except smtplib.SMTPServerError as e:
        # Server error (4xx or 5xx)
        smtp_code = getattr(e, 'smtp_code', 0)
        if _is_permanent_error(smtp_code):
            logger.debug("smtp_permanent_error", mx=mx_host, code=smtp_code, error=str(e))
            return False, False
        else:
            # 4xx errors are temporary - retry
            logger.debug("smtp_temporary_error", mx=mx_host, code=smtp_code, error=str(e))
            raise  # Re-raise to trigger retry
    except Exception as exc:
        # Any other exception: treat as permanent to avoid infinite retries
        logger.debug("smtp_error", mx=mx_host, error=str(exc))
        return False, False


def verify_smtp(email: str, mx_records: list[str]) -> tuple[bool, bool]:
    """
    Verify an email address via SMTP using the provided MX records.

    Args:
        email: The email address to verify
        mx_records: List of MX hostnames sorted by priority (lowest first)

    Returns:
        tuple: (smtp_valid, catch_all) where:
            smtp_valid: True if the email address was accepted by the server
            catch_all: True if a random email at the domain was accepted (indicating catch-all)
    """
    if not mx_records:
        return False, False

    # Try up to SMTP_MAX_MX_TO_TRY MX records in order of priority
    for mx in mx_records[:SMTP_MAX_MX_TO_TRY]:
        last_exception = None
        for attempt in range(SMTP_RETRIES + 1):  # +1 for initial attempt
            try:
                result = _smtp_check(email, mx, SMTP_TIMEOUT)
                if result[0]:  # If SMTP check succeeded, return immediately
                    return result
                # If we get here, the SMTP check returned (False, False) which means
                # a permanent error (e.g., mailbox does not exist). No point retrying.
                break
            except Exception as e:
                # Temporary error (e.g., connection issue, 4xx response) - retry
                last_exception = e
                # If this is the last attempt, don't retry
                if attempt == SMTP_RETRIES:
                    logger.debug("smtp_final_attempt_failed",
                                mx=mx, attempt=attempt+1, error=str(e))
                    break
                # Otherwise, log and retry
                logger.debug("smtp_retry_attempt",
                            mx=mx, attempt=attempt+1, error=str(e))
                continue

        # If we exhausted retries for this MX and had an exception, continue to next MX
        if last_exception:
            logger.debug("smtp_moving_to_next_mx", mx=mx, error=str(last_exception))
            continue

    # If all MX records failed
    return False, False


async def async_verify_smtp(email: str, mx_records: list[str]) -> tuple[bool, bool]:
    """
    Asynchronously verify an email address via SMTP using the provided MX records.

    Args:
        email: The email address to verify
        mx_records: List of MX hostnames sorted by priority (lowest first)

    Returns:
        tuple: (smtp_valid, catch_all) where:
            smtp_valid: True if the email address was accepted by the server
            catch_all: True if a random email at the domain was accepted (indicating catch-all)
    """
    return await asyncio.to_thread(verify_smtp, email, mx_records)