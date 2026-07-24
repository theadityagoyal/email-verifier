import smtplib
import socket
import asyncio
import random
import string
from typing import Tuple, List, Optional
from dataclasses import dataclass
from enum import Enum
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# ── Settings ──
SENDER_EMAIL = settings.SMTP_SENDER_EMAIL
HELO_DOMAIN = settings.SMTP_HELO_DOMAIN
SMTP_TIMEOUT = settings.SMTP_TIMEOUT
SMTP_RETRIES = settings.SMTP_RETRIES
SMTP_MAX_MX_TO_TRY = settings.SMTP_MAX_MX_TO_TRY


class SmtpOutcome(str, Enum):
    """
    Raw SMTP transaction outcome.

    IMPORTANT: Derived bools for backward compat:
      - smtp_valid = outcome in (VALID, CATCH_ALL)
      - catch_all = catch_all_outcome (True only for CATCH_ALL)

    BLOCKED is a best-effort heuristic (550 + "blocked"/"blacklist" in response text).
    It MUST NOT be used for scoring decisions — treat same as INVALID for scoring.
    """
    VALID = "valid"              # 250 on target RCPT, 5xx on random probe
    INVALID = "invalid"          # 5xx on target RCPT (mailbox not found, etc.)
    CATCH_ALL = "catch_all"      # 250 on target RCPT AND 250 on random probe
    GREYLISTED = "greylisted"    # 450/451/452 on target RCPT
    RATE_LIMITED = "rate_limited"  # 421 (service not available, too many connections)
    TEMP_FAILURE = "temp_failure"  # Other 4xx (transient server error)
    TIMEOUT = "timeout"          # Socket/connection timeout
    BLOCKED = "blocked"          # 550 with "blocked"/"blacklist" in text (heuristic)
    UNKNOWN = "unknown"          # Unexpected error / unrecognized code


@dataclass(frozen=True)
class SmtpResult:
    """
    Structured result of an SMTP check.

    Fields:
        outcome: Classified SmtpOutcome enum
        smtp_code: Raw 3-digit SMTP reply code (0 if no code available)
        raw_response: Full SMTP response text (for debugging)
        catch_all_outcome: Random probe also accepted (True only for CATCH_ALL)
    """
    outcome: SmtpOutcome
    smtp_code: int
    raw_response: str
    catch_all_outcome: bool


def _is_permanent_error(smtp_code: int) -> bool:
    """Determine if an SMTP status code indicates a permanent failure."""
    return 500 <= smtp_code < 600


def _is_temporary_error(smtp_code: int) -> bool:
    """Determine if an SMTP status code indicates a temporary failure."""
    return 400 <= smtp_code < 500


def _random_email(domain: str) -> str:
    """Generate a random email address for the given domain to test catch-all."""
    chars = string.ascii_lowercase + string.digits
    local = "".join(random.choices(chars, k=12))
    return f"{local}@{domain}"


def _classify_outcome(
    target_code: int,
    target_text: str,
    catch_all_code: Optional[int] = None,
    catch_all_text: str = "",
) -> SmtpResult:
    """
    Classify raw SMTP response codes into SmtpOutcome.

    Args:
        target_code: SMTP code for the target email RCPT
        target_text: SMTP response text for target email
        catch_all_code: SMTP code for random probe RCPT (None if not sent)
        catch_all_text: SMTP response text for random probe

    Returns:
        SmtpResult with outcome, code, raw_response, and catch_all flag
    """
    catch_all = False

    # Catch-all logic: both target and random probe accepted
    if target_code == 250 and catch_all_code == 250:
        return SmtpResult(
            outcome=SmtpOutcome.CATCH_ALL,
            smtp_code=250,
            raw_response=f"{target_text} | probe: {catch_all_text}",
            catch_all_outcome=True,
        )

    # Target accepted, probe rejected/not sent → VALID
    if target_code == 250:
        return SmtpResult(
            outcome=SmtpOutcome.VALID,
            smtp_code=250,
            raw_response=target_text,
            catch_all_outcome=False,
        )

    # Greylisting (typical 450/451/452)
    if target_code in (450, 451, 452):
        return SmtpResult(
            outcome=SmtpOutcome.GREYLISTED,
            smtp_code=target_code,
            raw_response=target_text,
            catch_all_outcome=False,
        )

    # Rate limiting / service unavailable
    if target_code == 421:
        return SmtpResult(
            outcome=SmtpOutcome.RATE_LIMITED,
            smtp_code=421,
            raw_response=target_text,
            catch_all_outcome=False,
        )

    # Other 4xx = temporary failure
    if _is_temporary_error(target_code):
        return SmtpResult(
            outcome=SmtpOutcome.TEMP_FAILURE,
            smtp_code=target_code,
            raw_response=target_text,
            catch_all_outcome=False,
        )

    # 5xx permanent failures
    if _is_permanent_error(target_code):
        # Heuristic: 550 with "blocked"/"blacklist" in text
        text_lower = (target_text or "").lower()
        if target_code == 550 and ("blocked" in text_lower or "blacklist" in text_lower):
            return SmtpResult(
                outcome=SmtpOutcome.BLOCKED,
                smtp_code=550,
                raw_response=target_text,
                catch_all_outcome=False,
            )
        return SmtpResult(
            outcome=SmtpOutcome.INVALID,
            smtp_code=target_code,
            raw_response=target_text,
            catch_all_outcome=False,
        )

    return SmtpResult(
        outcome=SmtpOutcome.UNKNOWN,
        smtp_code=target_code,
        raw_response=target_text,
        catch_all_outcome=False,
    )


def _smtp_check(
    email: str,
    mx_host: str,
    timeout: int,
) -> SmtpResult:
    """
    Perform SMTP check on a single MX host.

    Returns:
        SmtpResult with outcome, smtp_code, raw_response, catch_all_outcome

    Raises:
        Exception: For temporary errors that should trigger retry (connection issues, 4xx)
    """
    domain = email.split("@")[1]
    try:
        with smtplib.SMTP(timeout=timeout) as server:
            server.connect(mx_host, 25)
            server.sock.settimeout(timeout)
            server.helo(HELO_DOMAIN)
            server.mail(SENDER_EMAIL)

            # Target email
            target_code, target_msg = server.rcpt(email)
            target_text = target_msg.decode() if isinstance(target_msg, bytes) else str(target_msg)

            # Catch-all probe
            probe_email = _random_email(domain)
            catch_all_code, catch_all_msg = server.rcpt(probe_email)
            catch_all_text = catch_all_msg.decode() if isinstance(catch_all_msg, bytes) else str(catch_all_msg)

            return _classify_outcome(
                target_code=target_code,
                target_text=target_text,
                catch_all_code=catch_all_code,
                catch_all_text=catch_all_text,
            )

    except (socket.timeout, smtplib.SMTPConnectError,
            smtplib.SMTPServerDisconnected, ConnectionRefusedError) as e:
        logger.debug("smtp_connection_error", mx=mx_host, error=str(e))
        raise  # Re-raise to trigger retry
    except smtplib.SMTPRecipientsRefused as e:
        # Recipient refused - permanent error
        # Extract first recipient's error (there's only one in our case)
        for recip, (code, msg) in e.recipients.items():
            text = msg.decode() if isinstance(msg, bytes) else str(msg)
            logger.debug("smtp_recipient_refused", mx=mx_host, code=code, text=text)
            return _classify_outcome(target_code=code, target_text=text)
    except smtplib.SMTPServerError as e:
        smtp_code = getattr(e, 'smtp_code', 0)
        smtp_msg = getattr(e, 'smtp_error', b'')
        text = smtp_msg.decode() if isinstance(smtp_msg, bytes) else str(smtp_msg)
        if _is_permanent_error(smtp_code):
            logger.debug("smtp_permanent_error", mx=mx_host, code=smtp_code, text=text)
            return _classify_outcome(target_code=smtp_code, target_text=text)
        else:
            logger.debug("smtp_temporary_error", mx=mx_host, code=smtp_code, text=text)
            raise  # Re-raise to trigger retry
    except Exception as exc:
        logger.debug("smtp_error", mx=mx_host, error=str(exc))
        # Treat unknown exceptions as permanent to avoid infinite retries
        return SmtpResult(
            outcome=SmtpOutcome.UNKNOWN,
            smtp_code=0,
            raw_response=str(exc),
            catch_all_outcome=False,
        )


def verify_smtp(email: str, mx_records: List[str], timeout: Optional[int] = None) -> SmtpResult:
    """
    Verify an email address via SMTP using the provided MX records.

    Args:
        email: The email address to verify
        mx_records: List of MX hostnames sorted by priority (lowest first)
        timeout: Optional timeout override in seconds (uses global SMTP_TIMEOUT if not provided)

    Returns:
        SmtpResult with outcome, code, response, and catch_all flag
    """
    if not mx_records:
        return SmtpResult(
            outcome=SmtpOutcome.UNKNOWN,
            smtp_code=0,
            raw_response="No MX records provided",
            catch_all_outcome=False,
        )

    effective_timeout = timeout if timeout is not None else SMTP_TIMEOUT
    last_exception = None
    for mx in mx_records[:SMTP_MAX_MX_TO_TRY]:
        for attempt in range(SMTP_RETRIES + 1):
            try:
                result = _smtp_check(email, mx, effective_timeout)
                # If we got a permanent result (not UNKNOWN), return it
                if result.outcome != SmtpOutcome.UNKNOWN:
                    return result
                # UNKNOWN from exception path - don't retry, try next MX
                break
            except Exception as e:
                last_exception = e
                if attempt == SMTP_RETRIES:
                    logger.debug("smtp_final_attempt_failed",
                                mx=mx, attempt=attempt + 1, error=str(e))
                    break
                logger.debug("smtp_retry_attempt",
                            mx=mx, attempt=attempt + 1, error=str(e))
                continue

        if last_exception:
            logger.debug("smtp_moving_to_next_mx", mx=mx, error=str(last_exception))
            continue

    # All MX exhausted
    return SmtpResult(
        outcome=SmtpOutcome.UNKNOWN,
        smtp_code=0,
        raw_response="All MX records exhausted",
        catch_all_outcome=False,
    )


async def async_verify_smtp(email: str, mx_records: List[str], timeout: Optional[int] = None) -> SmtpResult:
    """
    Asynchronously verify an email address via SMTP.

    Args:
        email: The email address to verify
        mx_records: List of MX hostnames sorted by priority
        timeout: Optional timeout override in seconds

    Returns:
        SmtpResult with outcome, code, response, and catch_all flag
    """
    return await asyncio.to_thread(verify_smtp, email, mx_records, timeout)