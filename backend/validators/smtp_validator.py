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
    EVASION_SUSPECTED is a NEW outcome indicating the server accepts realistic-looking
    fake addresses but rejects obvious random ones — cannot trust the target's 250.
    """
    VALID = "valid"              # 250 on target RCPT, 5xx on random probe
    INVALID = "invalid"          # 5xx on target RCPT (mailbox not found, etc.)
    CATCH_ALL = "catch_all"      # 250 on target RCPT AND 250 on random probe
    GREYLISTED = "greylisted"    # 450/451 on target RCPT
    MAILBOX_FULL = "mailbox_full"  # 452 (mailbox full / quota exceeded)
    RATE_LIMITED = "rate_limited"  # 421 (service not available, too many connections)
    TEMP_FAILURE = "temp_failure"  # Other 4xx (transient server error)
    TIMEOUT = "timeout"          # Socket/connection timeout
    BLOCKED = "blocked"          # 550 with "blocked"/"blacklist" in text (heuristic)
    UNKNOWN = "unknown"          # Unexpected error / unrecognized code
    EVASION_SUSPECTED = "evasion_suspected"  # NEW: target=250, obvious!=250, realistic=250


@dataclass(frozen=True)
class SmtpResult:
    """
    Structured result of an SMTP check.

    Fields:
        outcome: Classified SmtpOutcome enum
        smtp_code: Raw 3-digit SMTP reply code (0 if no code available)
        raw_response: Full SMTP response text (for debugging)
        catch_all_outcome: Random probe also accepted (True only for CATCH_ALL)
        probe_mismatch: True ONLY when EVASION_SUSPECTED (server accepts
            realistic-looking fakes but rejects obvious random probes)
    """
    outcome: SmtpOutcome
    smtp_code: int
    raw_response: str
    catch_all_outcome: bool
    probe_mismatch: bool


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


# Common first-name-like tokens for realistic fake probes.
# These are short, human-like patterns (not real names, just "looks human-typed").
_REALISTIC_PREFIXES = (
    "ajohnson", "bsmith", "cwilliams", "djones", "ebrown", "fdavis", "gwilson",
    "hlee", "iwhite", "jharris", "kmartin", "lthomas", "mgarcia", "nmartinez",
    "orobinson", "pclark", "qrodriguez", "rlewis", "slee", "swalker", "thall",
    "uyoung", "vallen", "wking", "xwright", "ylop", "zscott", "maria", "jose",
    "david", "james", "michael", "robert", "william", "richard", "charles",
    "joseph", "thomas", "christopher", "daniel", "matthew", "anthony", "mark",
    "donald", "steven", "paul", "andrew", "joshua", "kenneth", "kevin", "brian",
    "george", "edward", "ronald", "timothy", "jason", "jeffrey", "ryan", "jacob",
    "gary", "nicholas", "eric", "jonathan", "stephen", "larry", "justin", "scott",
    "brandon", "benjamin", "samuel", "gregory", "frank", "alexander", "raymond",
    "patrick", "jack", "dennis", "jerry", "tyler", "aaron", "jose", "adam",
    "nathan", "henry", "zachary", "douglas", "peter", "kyle", "walter", "arthur",
    "dylan", "ryan", "christian", "jordan", "ethan", "austin", "sean", "alex",
    "ashley", "amanda", "jennifer", "lisa", "sarah", "karen", "michelle", "kimberly",
    "emily", "heather", "nicole", "jessica", "elizabeth", "laura", "stephanie",
    "rebecca", "sharon", "cynthia", "kathleen", "amy", "angela", "melissa",
    "deborah", "dorothy", "lisa", "nancy", "helen", "sandra", "donna", "carol",
    "ruth", "sharon", "lisa", "michelle", "laura", "sarah", "kimberly", "emily",
    "amanda", "melissa", "deborah", "dorothy", "lisa", "nancy", "karen", "betty",
    "helen", "sandra", "donna", "carol", "ruth", "sharon", "michelle", "laura",
    "sarah", "amber", "brittany", "courtney", "heather", "jennifer", "jessica",
    "laura", "lindsey", "megan", "nicole", "rachel", "sarah", "stephanie",
    "tiffany", "victoria", "ashley", "brittany", "emily", "heather", "jennifer",
    "jessica", "laura", "lisa", "mary", "nicole", "sarah", "stephanie"
)


def _realistic_fake_email(domain: str) -> str:
    """
    Generate a 'realistic fake' email for the catch-all probe.

    Combines a common first-name-like token + 1-3 random digits
    (e.g., 'jsmith482', 'arahman19', 'maria203'). This looks like a
    human-typed address rather than a purely random string, which can
    trigger different behavior on anti-harvesting SMTP servers.
    """
    prefix = random.choice(_REALISTIC_PREFIXES)
    digits = "".join(random.choices(string.digits, k=random.randint(1, 3)))
    return f"{prefix}{digits}@{domain}"


def _classify_outcome(
    target_code: int,
    target_text: str,
    obvious_code: int,
    obvious_text: str,
    realistic_code: int,
    realistic_text: str,
) -> SmtpResult:
    """
    Classify raw SMTP response codes into SmtpOutcome using dual-probe logic.

    Args:
        target_code: SMTP code for the target email RCPT
        target_text: SMTP response text for target email
        obvious_code: SMTP code for obvious-fake (random) probe RCPT
        obvious_text: SMTP response text for obvious-fake probe
        realistic_code: SMTP code for realistic-fake probe RCPT
        realistic_text: SMTP response text for realistic-fake probe

    Returns:
        SmtpResult with outcome, code, raw_response, catch_all flag, probe_mismatch flag
    """
    catch_all = False
    probe_mismatch = False

    # Case 1: CATCH_ALL — target accepted, BOTH probes accepted
    if target_code == 250 and obvious_code == 250 and realistic_code == 250:
        return SmtpResult(
            outcome=SmtpOutcome.CATCH_ALL,
            smtp_code=250,
            raw_response=f"{target_text} | probe(obvious): {obvious_text} | probe(realistic): {realistic_text}",
            catch_all_outcome=True,
            probe_mismatch=False,
        )

    # Case 2: VALID — target accepted, BOTH probes rejected (genuine mailbox)
    if target_code == 250 and obvious_code != 250 and realistic_code != 250:
        return SmtpResult(
            outcome=SmtpOutcome.VALID,
            smtp_code=250,
            raw_response=f"{target_text} | probe(obvious): {obvious_text} | probe(realistic): {realistic_text}",
            catch_all_outcome=False,
            probe_mismatch=False,
        )

    # Case 3: EVASION_SUSPECTED — target accepted, obvious probe rejected,
    # but realistic probe accepted. Server distinguishes "obvious" fakes from
    # "realistic" fakes — cannot trust target's 250 as real confirmation.
    if target_code == 250 and obvious_code != 250 and realistic_code == 250:
        return SmtpResult(
            outcome=SmtpOutcome.EVASION_SUSPECTED,
            smtp_code=250,
            raw_response=f"{target_text} | probe(obvious): {obvious_text} | probe(realistic): {realistic_text}",
            catch_all_outcome=False,
            probe_mismatch=True,
        )

    # Case 4: Target rejected (not 250) — classify based on target code alone.
    # Greylisting (typical 450/451)
    if target_code in (450, 451):
        return SmtpResult(
            outcome=SmtpOutcome.GREYLISTED,
            smtp_code=target_code,
            raw_response=target_text,
            catch_all_outcome=False,
            probe_mismatch=False,
        )

    # Mailbox full / quota exceeded (452)
    if target_code == 452:
        return SmtpResult(
            outcome=SmtpOutcome.MAILBOX_FULL,
            smtp_code=452,
            raw_response=target_text,
            catch_all_outcome=False,
            probe_mismatch=False,
        )

    # Rate limiting / service unavailable
    if target_code == 421:
        return SmtpResult(
            outcome=SmtpOutcome.RATE_LIMITED,
            smtp_code=421,
            raw_response=target_text,
            catch_all_outcome=False,
            probe_mismatch=False,
        )

    # Other 4xx = temporary failure
    if _is_temporary_error(target_code):
        return SmtpResult(
            outcome=SmtpOutcome.TEMP_FAILURE,
            smtp_code=target_code,
            raw_response=target_text,
            catch_all_outcome=False,
            probe_mismatch=False,
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
                probe_mismatch=False,
            )
        return SmtpResult(
            outcome=SmtpOutcome.INVALID,
            smtp_code=target_code,
            raw_response=target_text,
            catch_all_outcome=False,
            probe_mismatch=False,
        )

    return SmtpResult(
        outcome=SmtpOutcome.UNKNOWN,
        smtp_code=target_code,
        raw_response=target_text,
        catch_all_outcome=False,
        probe_mismatch=False,
    )


def _smtp_check(
    email: str,
    mx_host: str,
    timeout: int,
) -> SmtpResult:
    """
    Perform SMTP check on a single MX host.

    Runs TWO catch-all probes in the same SMTP session:
      1. Obvious-fake probe (12-char random string)
      2. Realistic-fake probe (first-name-like + digits)

    Returns:
        SmtpResult with outcome, smtp_code, raw_response, catch_all_outcome, probe_mismatch

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

            # Probe 1: Obvious fake (12-char random)
            obvious_email = _random_email(domain)
            obvious_code, obvious_msg = server.rcpt(obvious_email)
            obvious_text = obvious_msg.decode() if isinstance(obvious_msg, bytes) else str(obvious_msg)

            # Probe 2: Realistic fake (first-name-like + digits)
            realistic_email = _realistic_fake_email(domain)
            realistic_code, realistic_msg = server.rcpt(realistic_email)
            realistic_text = realistic_msg.decode() if isinstance(realistic_msg, bytes) else str(realistic_msg)

            return _classify_outcome(
                target_code=target_code,
                target_text=target_text,
                obvious_code=obvious_code,
                obvious_text=obvious_text,
                realistic_code=realistic_code,
                realistic_text=realistic_text,
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
            # When this happens on target RCPT, we don't have probe codes
            return _classify_outcome(
                target_code=code,
                target_text=text,
                obvious_code=None,
                obvious_text="",
                realistic_code=None,
                realistic_text="",
            )
    except smtplib.SMTPServerError as e:
        smtp_code = getattr(e, 'smtp_code', 0)
        smtp_msg = getattr(e, 'smtp_error', b'')
        text = smtp_msg.decode() if isinstance(smtp_msg, bytes) else str(smtp_msg)
        if _is_permanent_error(smtp_code):
            logger.debug("smtp_permanent_error", mx=mx_host, code=smtp_code, text=text)
            return _classify_outcome(
                target_code=smtp_code,
                target_text=text,
                obvious_code=None,
                obvious_text="",
                realistic_code=None,
                realistic_text="",
            )
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
            probe_mismatch=False,
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
            probe_mismatch=False,
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
        probe_mismatch=False,
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