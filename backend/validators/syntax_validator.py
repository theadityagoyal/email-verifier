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
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F9FF"
    "\u2600-\u26FF"
    "\u2700-\u27BF]+",
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
        return False, None, None

    # Strip only leading/trailing spaces
    email = email.strip()

    # Empty check
    if not email:
        return False, None, None

    # Emoji check
    if EMOJI_PATTERN.search(email):
        logger.debug("syntax_invalid_emoji", email=email)
        return False, None, None

    # Space anywhere in email
    if " " in email or "\t" in email:
        logger.debug("syntax_invalid_space", email=email)
        return False, None, None

    # Length check
    if len(email) > 254:
        logger.debug("syntax_invalid_too_long", email=email)
        return False, None, None

    # Exactly one @ check
    if email.count("@") != 1:
        logger.debug("syntax_invalid_at_sign", email=email)
        return False, None, None

    local, domain = email.split("@")

    # Local part empty or too long
    if not local or len(local) > 64:
        return False, None, None

    # Domain basic checks
    if not domain or len(domain) < 3:
        return False, None, None

    # Invalid special characters check
    if INVALID_CHARS.search(local):
        logger.debug("syntax_invalid_special_chars", email=email, local=local)
        return False, None, None

    # Only allowed chars in local part
    if not ALLOWED_LOCAL_CHARS.match(local):
        logger.debug("syntax_invalid_chars", email=email)
        return False, None, None

    # Quotes check - single, double, backtick
    if any(c in email for c in ['"', "'", '`']):
        logger.debug("syntax_invalid_quotes", email=email)
        return False, None, None

    # Consecutive dots check
    if ".." in email:
        logger.debug("syntax_invalid_consecutive_dots", email=email)
        return False, None, None

    # Starting or ending with dot
    if local.startswith(".") or local.endswith("."):
        return False, None, None

    if domain.startswith(".") or domain.endswith("."):
        return False, None, None

    # No TLD check
    if "." not in domain:
        return False, None, None

    # TLD length check
    tld = domain.split(".")[-1]
    if len(tld) < 2 or len(tld) > 6:
        return False, None, None

    # Domain invalid chars
    if INVALID_CHARS.search(domain):
        return False, None, None

    # Full validation using email-validator library
    try:
        info = validate_email(email, check_deliverability=False)
        normalized = info.normalized
        domain = info.domain
        logger.debug("syntax_valid", email=email)
        return True, normalized, domain
    except EmailNotValidError as exc:
        logger.debug("syntax_invalid", email=email, reason=str(exc))
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