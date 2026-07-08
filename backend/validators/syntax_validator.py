from email_validator import validate_email, EmailNotValidError
from utils.logging import get_logger
import re

logger = get_logger(__name__)

ROLE_BASED_PREFIXES = {
    # Generic
    "admin", "administrator", "support", "info", "information",
    "contact", "help", "helpdesk", "assistance",
    # Mail system
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "postmaster", "mailer-daemon", "mailerdaemon", "bounce",
    "bounces", "webmaster", "hostmaster",
    # Business
    "sales", "billing", "invoice", "invoices", "payments",
    "accounts", "accounting", "finance", "financial",
    "legal", "compliance", "contracts",
    # HR
    "hr", "humanresources", "human-resources", "careers",
    "jobs", "recruitment", "hiring", "talent",
    # Marketing
    "marketing", "newsletter", "newsletters", "promotions",
    "promo", "offers", "deals", "campaign", "campaigns",
    "subscribe", "unsubscribe", "notifications",
    # Tech
    "security", "abuse", "spam", "phishing", "fraud",
    "operations", "ops", "devops", "it", "tech", "technical",
    "ftp", "www", "web", "api", "dev", "developer",
    "system", "systems", "server", "servers", "network",
    # Management
    "ceo", "cto", "cfo", "coo", "founder", "cofounder",
    "director", "manager", "management", "executive",
    "president", "chairman",
    # Communication
    "press", "media", "pr", "publicrelations", "public-relations",
    "events", "team", "hello", "hi", "hey", "office",
    "mail", "email", "enquiry", "enquiries", "query",
    "queries", "feedback", "feedbacks", "care",
    # Social
    "twitter", "facebook", "instagram", "linkedin", "youtube",
    "social", "community", "forum", "forums",
    # Indian specific
    "seva", "sewa", "sampark", "jankari", "sahayata",
    # News
    "news", "usenet", "uucp", "editor", "editorial",
    "reporter", "journalist",
    # Support tiers
    "support1", "support2", "support3",
    "helpdesk1", "helpdesk2",
}

# Allowed special characters in local part
ALLOWED_LOCAL_CHARS = re.compile(r'^[a-zA-Z0-9._%+\-]+$')

# NOT allowed - quotes, brackets, special symbols
INVALID_CHARS = re.compile(r'["\'\`\[\]\(\)\{\}\\\/<>:;,\s\!\#\$\^\&\*\=\?\|~]')

# Emoji detection
EMOJI_PATTERN = re.compile(
    "[\U00010000-\U0010ffff"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F9FF"
    "☀-⛿"
    "✀-➿]+",
    flags=re.UNICODE
)


def validate_syntax(email: str) -> tuple[bool, str | None, str | None]:
    """
    Full syntax validation:
    - Format check
    - Length check
    - Space check
    - Special character check
    - Quotes check
    - Emoji check
    - Consecutive dots check
    - Valid TLD check
    """
    if not email or not isinstance(email, str):
        logger.warning("syntax_invalid_not_string", email=email)
        return False, None, None

    # Strip only leading/trailing spaces
    email = email.strip()

    # Empty check
    if not email:
        logger.warning("syntax_invalid_empty_after_strip", email=email)
        return False, None, None

    # Emoji check
    if EMOJI_PATTERN.search(email):
        logger.warning("syntax_invalid_emoji", email=email)
        return False, None, None

    # Space anywhere in email
    if " " in email or "\t" in email:
        logger.warning("syntax_invalid_space", email=email)
        return False, None, None

    # Length check
    if len(email) > 254:
        logger.warning("syntax_invalid_too_long", email=email)
        return False, None, None

    # Exactly one @ check
    if email.count("@") != 1:
        logger.warning("syntax_invalid_at_sign", email=email)
        return False, None, None

    local, domain = email.split("@")

    # Local part empty or too long
    if not local or len(local) > 64:
        logger.warning("syntax_invalid_local_part", email=email, local=local, length=len(local) if local else 0)
        return False, None, None

    # Domain basic checks
    if not domain or len(domain) < 3:
        logger.warning("syntax_invalid_domain", email=email, domain=domain, length=len(domain) if domain else 0)
        return False, None, None

    # Invalid special characters check
    if INVALID_CHARS.search(local):
        logger.warning("syntax_invalid_special_chars", email=email, local=local)
        return False, None, None

    # Only allowed chars in local part
    if not ALLOWED_LOCAL_CHARS.match(local):
        logger.warning("syntax_invalid_chars", email=email)
        return False, None, None

    # Quotes check - single, double, backtick
    if any(c in email for c in ['"', "'", '`']):
        logger.warning("syntax_invalid_quotes", email=email)
        return False, None, None

    # Consecutive dots check
    if ".." in email:
        logger.warning("syntax_invalid_consecutive_dots", email=email)
        return False, None, None

    # Starting or ending with dot
    if local.startswith(".") or local.endswith("."):
        logger.warning("syntax_invalid_local_dot", email=email, local=local)
        return False, None, None

    if domain.startswith(".") or domain.endswith("."):
        logger.warning("syntax_invalid_domain_dot", email=email, domain=domain)
        return False, None, None

    # No TLD check
    if "." not in domain:
        logger.warning("syntax_invalid_no_dot_in_domain", email=email, domain=domain)
        return False, None, None

    # Domain invalid chars
    if INVALID_CHARS.search(domain):
        logger.warning("syntax_invalid_domain_chars", email=email, domain=domain)
        return False, None, None

    # Full validation using email-validator library
    try:
        info = validate_email(email, check_deliverability=False)
        normalized = info.normalized
        domain = info.domain
        logger.debug("syntax_valid", email=email)
        return True, normalized, domain
    except EmailNotValidError as exc:
        # Changed to ERROR (was DEBUG) so the exact rejection reason
        # actually shows up in logs instead of being silently swallowed.
        logger.error("syntax_invalid_library_reason", email=email, reason=str(exc))
        return False, None, None
    except Exception as exc:
        # email_validator can raise non-EmailNotValidError exceptions too
        # (e.g. IDNA/encoding errors) — these were previously NOT caught here,
        # so they'd escape and get swallowed by verify_email()'s broad except,
        # showing up as a generic 0%/invalid with zero clue why.
        logger.error("syntax_validation_unexpected_error", email=email, error=str(exc))
        return False, None, None


def is_role_based(email: str) -> bool:
    try:
        local = email.split("@")[0].lower()
        # Exact match
        if local in ROLE_BASED_PREFIXES:
            return True
        # Partial match - support123, admin2 etc
        for prefix in ROLE_BASED_PREFIXES:
            if local.startswith(prefix) and len(local) > len(prefix):
                suffix = local[len(prefix):]
                if suffix.isdigit():
                    return True
        return False
    except Exception:
        return False
