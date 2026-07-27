import math
import re
from models.models import EmailStatus
from validators.syntax_validator import is_role_based

TRUSTED_DOMAINS = frozenset({

    # ── Microsoft ─────────────────────────────────────────────────────────────
    "outlook.com", "hotmail.com", "live.com", "msn.com",
    "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.in",
    "hotmail.it", "hotmail.es", "hotmail.com.ar", "hotmail.com.br",
    "live.in", "live.co.uk", "live.com.au", "live.fr",
    "windowslive.com",

    # ── Google ────────────────────────────────────────────────────────────────
    "gmail.com", "googlemail.com",

    # ── Yahoo ─────────────────────────────────────────────────────────────────
    "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "yahoo.fr",
    "yahoo.de", "yahoo.es", "yahoo.it", "yahoo.com.ar",
    "yahoo.com.br", "yahoo.com.au", "yahoo.ca", "yahoo.jp",
    "ymail.com", "rocketmail.com",

    # ── Apple ─────────────────────────────────────────────────────────────────
    "icloud.com", "me.com", "mac.com",

    # ── Privacy / Secure ──────────────────────────────────────────────────────
    "protonmail.com", "protonmail.ch", "proton.me", "pm.me",
    "tutanota.com", "tutanota.de", "tutamail.com",
    "fastmail.com", "fastmail.fm", "fastmail.net",
    "hushmail.com", "mailfence.com", "runbox.com",

    # ── German ────────────────────────────────────────────────────────────────
    "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch",
    "web.de", "freenet.de", "t-online.de",

    # ── French ────────────────────────────────────────────────────────────────
    "laposte.net", "orange.fr", "wanadoo.fr", "free.fr",
    "sfr.fr", "bbox.fr",

    # ── Indian Providers ──────────────────────────────────────────────────────
    "rediffmail.com", "indiatimes.com", "sify.com",
    "in.com", "indimail.org",

    # ── Russian ───────────────────────────────────────────────────────────────
    "mail.ru", "yandex.ru", "yandex.com", "rambler.ru",
    "bk.ru", "inbox.ru", "list.ru",

    # ── Japanese ──────────────────────────────────────────────────────────────
    "docomo.ne.jp", "softbank.ne.jp", "ezweb.ne.jp",
    "yahoo.co.jp", "nifty.com",

    # ── Others Global ─────────────────────────────────────────────────────────
    "aol.com", "aim.com", "zoho.com",
    "iname.com", "mail.com", "email.com",
    "usa.com", "dr.com", "myself.com",
})

# Minimum score guaranteed for a trusted domain that passed syntax and isn't
# disposable — keeps it at least 55 (so it falls in the "uncertain" or better bucket) even with harsh
# username penalties. Changed from 60 to 55 in Phase 5: trusted domains now
# go through real SMTP, so the score reflects the actual SMTP result.
# Ambiguous outcomes (timeout/greylist/blocked) use base_score=90 (not 80),
# so even with max penalty (-30): 90 + 10 - 30 = 70 (still above floor).
# Only real INVALID (550 mailbox not found) uses the penalized path (base=80).
TRUSTED_DOMAIN_SCORE_FLOOR = 55

# ── HIGH RISK SMTP PROVIDERS ──────────────────────────────────────────────────
# Chinese webmail providers (Sina/Weibo/Tencent/NetEase family) that are known
# to sometimes give false-positive SMTP 250 confirmations on realistic-looking
# fake addresses while rejecting obvious random probes. This is the
# "evasion_suspected" pattern. For these providers, we cap the base score at 75
# (instead of 100) even when SMTP returns VALID, because we cannot fully trust
# the confirmation. See weibo.com false-positive case.
HIGH_RISK_SMTP_PROVIDERS = frozenset({
    "weibo.com", "sina.com", "sina.cn", "qq.com", "163.com", "126.com",
    "sohu.com", "foxmail.com", "yeah.net", "vip.163.com", "vip.126.com",
    "sina.com.cn",
})

# ── Keyboard walk patterns ────────────────────────────────────────────────────
KEYBOARD_WALKS = [
    "qwertyuiop", "asdfghjkl", "zxcvbnm",   # horizontal rows
    "qazwsxedcrfvtgbyhnujmikolp",             # vertical snakes
    "1234567890", "0987654321",               # number rows
]

def _has_keyboard_walk(username: str, min_len: int = 4) -> bool:
    u = username.lower()
    for walk in KEYBOARD_WALKS:
        for i in range(len(walk) - min_len + 1):
            if walk[i:i+min_len] in u:
                return True
    return False

def _vowel_ratio(username: str) -> float:
    letters = [c for c in username.lower() if c.isalpha()]
    if not letters:
        return 0.0
    vowels = [c for c in letters if c in "aeiou"]
    return len(vowels) / len(letters)

def _max_consonant_cluster(username: str) -> int:
    """Consecutive consonants ka max run"""
    max_run = 0
    current = 0
    for c in username.lower():
        if c.isalpha() and c not in "aeiou":
            current += 1
            max_run = max(max_run, current)
        else:
            current = 0
    return max_run

def _entropy(username: str) -> float:
    """Shannon entropy — higher = more random"""
    if not username:
        return 0.0
    freq = {}
    for c in username.lower():
        freq[c] = freq.get(c, 0) + 1
    total = len(username)
    return -sum((f/total) * math.log2(f/total) for f in freq.values())

def _has_grouped_vowels(username: str) -> bool:
    """aeiou sab saath grouped hain — jaise 'aeiou...' ya '...aeiou'"""
    u = username.lower()
    # 4+ vowels consecutively
    return bool(re.search(r'[aeiou]{4,}', u))

def _is_all_digits(username: str) -> bool:
    return username.isdigit()

def _has_char_repetition(username: str) -> bool:
    """Same char 4+ baar consecutively"""
    return bool(re.search(r'(.)\1{3,}', username.lower()))


def analyze_username_quality(username: str) -> dict:
    """
    Username ko analyze karke quality score, flags aur verdict return karta hai.

    Returns:
        {
            "score": 0-100,
            "penalty": 0-30,
            "flags": [...],
            "verdict": "clean" | "suspicious" | "likely_fake" | "random"
        }
    """
    flags = []
    penalty = 0

    # Only letters+digits+dots+hyphens+underscores consider karo
    clean = re.sub(r'[.\-_+]', '', username)  # separators hata do analysis ke liye

    # 1. All digits
    if _is_all_digits(clean):
        flags.append("all_digits")
        penalty += 15

    # 2. Char repetition (aaaa, bbbb)
    if _has_char_repetition(clean):
        flags.append("char_repetition")
        penalty += 25

    # 3. Keyboard walk
    if _has_keyboard_walk(clean):
        flags.append("keyboard_walk")
        penalty += 25

    # 4. Vowel ratio
    ratio = _vowel_ratio(clean)
    if ratio == 0.0 and len(clean) > 3:
        flags.append("no_vowels")
        penalty += 30
    elif ratio < 0.15 and len(clean) > 5:
        flags.append("low_vowel_ratio")
        penalty += 20

    # 5. Grouped vowels (aeiouXYZ or XYZaeiou)
    if _has_grouped_vowels(clean):
        flags.append("grouped_vowels")
        penalty += 15

    # 6. Consonant cluster
    cluster = _max_consonant_cluster(clean)
    if cluster >= 6:
        flags.append("consonant_cluster")
        penalty += 10

    # 7. High entropy (very random)
    ent = _entropy(clean)
    if ent > 3.5 and len(clean) >= 8:
        flags.append("high_entropy")
        penalty += 20

    # Penalty cap — max 30 penalty
    penalty = min(penalty, 30)

    # Username score (sirf reference ke liye, UI mein dikhayenge)
    username_score = max(0, 100 - penalty * 3)

    # Verdict
    if penalty == 0:
        verdict = "clean"
    elif penalty <= 10:
        verdict = "suspicious"
    elif penalty <= 20:
        verdict = "likely_fake"
    else:
        verdict = "random"

    return {
        "score": username_score,
        "penalty": penalty,
        "flags": flags,
        "verdict": verdict,
    }


def calculate_score(
    syntax_valid: bool,
    domain_exists: bool,
    mx_found: bool,
    smtp_valid: bool,
    disposable: bool,
    catch_all: bool,
    domain: str = "",
    username: str = "",
    smtp_ambiguous_trusted: bool = False,
    spf_valid: bool | None = None,      # Phase 5: SPF record exists (None = unknown/not checked)
    dmarc_valid: bool | None = None,    # Phase 5: DMARC record exists (None = unknown/not checked)
    smtp_outcome: str | None = None,
    role_based: bool = False,
    probe_mismatch: bool = False,       # Task 1: EVASION_SUSPECTED detection
) -> tuple[int, dict]:
    """
    Returns (final_score, username_analysis)

    Scoring order (additive, each step clamped):
      1. base_score from validation chain (40..100)
      2. + trusted_bonus (+10 if trusted domain), clamp 100
      3. + spf_dmarc_delta (SPF +2, DMARC +2; absent -2 each; unknown = 0; range -4..+4), clamp 100
      4. - username_penalty (0..30), clamp 100
      5. clamp to floor (60 for trusted, 0 otherwise) — but NOT if SMTP confirmed invalid
    """
    # Username quality pehle analyze karo
    username_analysis = analyze_username_quality(username) if username else {
        "score": 100, "penalty": 0, "flags": [], "verdict": "clean"
    }
    penalty = username_analysis["penalty"]

    if role_based:
        penalty = min(30, penalty + 10)

    # Disposable = straight 0 (overrides trust — a disposable domain is
    # never safe, even if it happened to be in TRUSTED_DOMAINS)
    if disposable:
        return 0, username_analysis

    # Syntax fail = 0
    if not syntax_valid:
        return 0, username_analysis

    # Calculate base score based on validation results
    is_trusted = domain.lower() in TRUSTED_DOMAINS
    is_high_risk = domain.lower() in HIGH_RISK_SMTP_PROVIDERS

    # Phase 3: Trusted domain with ambiguous SMTP outcome (timeout/greylist/blocked)
    # uses base_score=90 (not 80) to avoid penalizing for inconclusive results.
    if is_trusted and smtp_ambiguous_trusted:
        base_score = 90
    else:
        # Domain nahi = 40
        if not domain_exists:
            base_score = 40
        # Domain hai but MX nahi = 60
        elif not mx_found:
            base_score = 60
        # MX hai + Catch-All = 70
        elif catch_all:
            base_score = 70
        # MX hai + SMTP invalid = 10
        elif smtp_outcome == "invalid":
            base_score = 10
        # MX hai + SMTP mailbox_full = 55
        elif smtp_outcome == "mailbox_full":
            base_score = 55
        # MX hai + SMTP ambiguous (timeout/greylisted/rate_limited/temp_failure/blocked/unknown) = 45
        elif smtp_outcome in ("timeout", "greylisted", "rate_limited", "temp_failure", "blocked", "unknown"):
            base_score = 45
        # MX hai + SMTP fail (fallback safety net if smtp_outcome somehow None)
        elif not smtp_valid:
            base_score = 45
        # MX hai + SMTP pass = 100
        else:
            base_score = 100

    # ── SCORE CAPS for high-risk / evasion-suspected cases ────────────────────

    # Cap 1: High-risk provider with VALID SMTP outcome
    # These providers (weibo.com, sina.com, qq.com, etc.) are known to sometimes
    # give false-positive 250 confirmations on realistic-looking fake addresses
    # while rejecting obvious random probes. We cap at 75 because we cannot
    # fully trust the confirmation. Reference: weibo.com false-positive case.
    if is_high_risk and smtp_outcome == "valid":
        base_score = min(base_score, 75)

    # Cap 2: Probe mismatch (EVASION_SUSPECTED from smtp_validator)
    # Server accepts realistic-looking fakes but rejects obvious ones — cannot
    # trust the target's 250 as genuine mailbox confirmation. Cap at 55
    # regardless of domain trust (no trusted_domain bonus/floor override).
    if probe_mismatch:
        base_score = min(base_score, 55)

    # Step 1: trusted domain bonus (+10, max 100)
    trusted_bonus = 10 if is_trusted else 0
    score_with_trusted = min(100, base_score + trusted_bonus)

    # Step 2: SPF/DMARC minor signal (−4..+4), then clamp to 100
    # Three-way logic: True=+2, False=−2, None/unknown=0
    def _delta(v: bool | None) -> int:
        if v is True:
            return 2
        if v is False:
            return -2
        return 0  # None = unknown, no impact

    spf_dmarc_delta = _delta(spf_valid) + _delta(dmarc_valid)
    score_with_spf_dmarc = min(100, score_with_trusted + spf_dmarc_delta)

    # Step 3: username quality penalty (0..30), then clamp to 100 (should already be ≤100)
    score_after_penalty = min(100, score_with_spf_dmarc - penalty)

    # Step 4: floor clamp (trusted floor = 55, else 0) — but NOT if SMTP confirmed invalid
    if is_trusted and smtp_outcome != "invalid":
        final_score = max(TRUSTED_DOMAIN_SCORE_FLOOR, score_after_penalty)
    else:
        final_score = max(0, score_after_penalty)

    return final_score, username_analysis


def determine_status(
    syntax_valid: bool,
    domain_exists: bool,
    mx_found: bool,
    smtp_valid: bool,
    disposable: bool,
    catch_all: bool,
    score: int,
    domain: str = "",
) -> EmailStatus:

    if score == 0:
        return EmailStatus.invalid
    if score <= 45:
        return EmailStatus.undeliverable
    if score <= 65:
        return EmailStatus.uncertain
    if score <= 75:
        return EmailStatus.unconfirmed
    if score <= 85:
        return EmailStatus.probably_valid
    if score <= 92:
        return EmailStatus.trusted
    return EmailStatus.deliverable


# ── Phase 2: Sub-status, Confidence, Reason Codes ────────────────────────────────
# These provide granular "why" signals that the frontend can render without
# needing to re-implement scoring logic. They're derived from the same inputs
# as determine_status() so they're always consistent.

SubStatus = str
Confidence = str  # "High" | "Medium" | "Low"
ReasonCode = str  # machine-readable code for programmatic handling

# Sub-status values:
#   mailbox_confirmed           — SMTP 250, not catch-all, normal mailbox
#   smtp_skipped_trusted        — Trusted domain fast-path (SMTP never probed)
#   catch_all_masked            — SMTP 250 but catch-all detected (can't confirm mailbox)
#   greylisted_unconfirmed      — SMTP 450/451/452 (temporary deferral)
#   dns_timeout_assumed         — DNS/MX lookup timed out, assumed valid for scoring
#   syntax_invalid              — Failed syntax validation
#   domain_not_found            — Domain does not exist in DNS
#   no_mx_records               — Domain exists but no MX records
#   disposable_domain           — Known disposable email provider
#   role_based_address          — Generic/role address (admin@, support@, etc.)
#   smtp_rejected                — SMTP permanent failure (550, mailbox not found)
#   smtp_blocked                — SMTP 550 with blocked/blacklist indication
#   smtp_rate_limited            — SMTP 421 (too many connections)
#   smtp_temp_failure           — Other 4xx temporary failure
#   unknown_error                — Unexpected/unclassified error
#   mailbox_accepted_unverified — Task 1: EVASION_SUSPECTED — server accepted target
#                                 and realistic fake but rejected obvious fake
#   mailbox_confirmed_high_risk_provider — Task 2: SMTP VALID but domain in
#                                          HIGH_RISK_SMTP_PROVIDERS (capped at 75)


def determine_sub_status(
    syntax_valid: bool,
    domain_exists: bool,
    mx_found: bool,
    smtp_valid: bool,
    disposable: bool,
    catch_all: bool,
    score: int,
    domain: str = "",
    smtp_outcome: str | None = None,
    role_based: bool = False,
    probe_mismatch: bool = False,      # Task 1: EVASION_SUSPECTED flag
) -> SubStatus:
    """
    Determine granular sub-status from verification signals.

    Args:
        ... (same as determine_status)
        smtp_outcome: Raw SmtpOutcome value from smtp_validator (VALID, INVALID, CATCH_ALL, GREYLISTED, RATE_LIMITED, TEMP_FAILURE, TIMEOUT, BLOCKED, UNKNOWN)
        role_based: Pre-computed role-based check result (True if username is role-based like admin@, support@, etc.)
        probe_mismatch: True when EVASION_SUSPECTED outcome detected (target 250, obvious fake rejected, realistic fake accepted)

    Returns:
        Sub-status string for frontend display and programmatic use.
    """
    is_trusted = domain.lower() in TRUSTED_DOMAINS
    is_high_risk = domain.lower() in HIGH_RISK_SMTP_PROVIDERS

    # 1. Syntax failure
    if not syntax_valid:
        return "syntax_invalid"

    # 2. Domain doesn't exist
    if not domain_exists:
        return "domain_not_found"

    # 3. No MX records
    if not mx_found:
        return "no_mx_records"

    # 4. Disposable domain
    if disposable:
        return "disposable_domain"

    # 5. Role-based address
    if role_based:
        return "role_based_address"

    # 6. SMTP outcome-based sub-statuses (Phase 1 enum)
    # Trusted domains now go through real SMTP — ambiguous outcomes get their own sub-status
    if smtp_outcome:
        # Trusted domain with ambiguous (non-conclusive) outcome
        if is_trusted and smtp_outcome in ("timeout", "greylisted", "temp_failure", "blocked", "unknown", "mailbox_full"):
            return "smtp_ambiguous_trusted"

        if smtp_outcome == "greylisted":
            return "greylisted_unconfirmed"
        if smtp_outcome == "rate_limited":
            return "smtp_rate_limited"
        if smtp_outcome == "temp_failure":
            return "smtp_temp_failure"
        if smtp_outcome == "timeout":
            return "dns_timeout_assumed"
        if smtp_outcome == "blocked":
            return "smtp_blocked"
        if smtp_outcome == "catch_all":
            return "catch_all_masked"
        if smtp_outcome == "invalid":
            return "smtp_rejected"
        if smtp_outcome == "mailbox_full":
            return "smtp_mailbox_full"
        if smtp_outcome == "valid":
            # Task 1: EVASION_SUSPECTED — probe mismatch detected
            if probe_mismatch:
                return "mailbox_accepted_unverified"
            # Task 2: High-risk provider with VALID outcome (capped at 75)
            if is_high_risk:
                return "mailbox_confirmed_high_risk_provider"
            return "mailbox_confirmed"

    # Fallback based on boolean flags (backward compat if smtp_outcome missing)
    if catch_all:
        return "catch_all_masked"
    if smtp_valid:
        return "mailbox_confirmed"
    return "smtp_rejected"


def determine_confidence(
    syntax_valid: bool,
    domain_exists: bool,
    mx_found: bool,
    smtp_valid: bool,
    disposable: bool,
    catch_all: bool,
    score: int,
    domain: str = "",
    smtp_outcome: str | None = None,
    role_based: bool = False,
    probe_mismatch: bool = False,      # Task 1: for medium confidence mapping
) -> Confidence:
    """
    Determine confidence bucket: High / Medium / Low.

    High: mailbox_confirmed, smtp_skipped_trusted (known good domains)
    Medium: catch_all_masked, role_based_address, smtp_ambiguous_trusted,
            mailbox_accepted_unverified (probe_mismatch),
            mailbox_confirmed_high_risk_provider
    Low: everything else (syntax_invalid, domain_not_found, no_mx_records, disposable_domain,
          smtp_rejected, smtp_blocked, smtp_rate_limited, smtp_temp_failure,
          greylisted_unconfirmed, dns_timeout_assumed, unknown_error)
    """
    sub = determine_sub_status(
        syntax_valid, domain_exists, mx_found, smtp_valid, disposable, catch_all,
        score, domain, smtp_outcome, role_based, probe_mismatch
    )

    high_confidence = {"mailbox_confirmed", "smtp_skipped_trusted"}
    medium_confidence = {
        "catch_all_masked", "smtp_ambiguous_trusted",
        "mailbox_accepted_unverified", "mailbox_confirmed_high_risk_provider"
    }

    if sub in high_confidence:
        return "High"
    if sub in medium_confidence:
        return "Medium"
    return "Low"


def determine_reason_code(
    syntax_valid: bool,
    domain_exists: bool,
    mx_found: bool,
    smtp_valid: bool,
    disposable: bool,
    catch_all: bool,
    score: int,
    domain: str = "",
    smtp_outcome: str | None = None,
    role_based: bool = False,
    probe_mismatch: bool = False,      # Task 1/2: not used directly, sub->upper handles it
) -> ReasonCode:
    """
    Determine machine-readable reason code for programmatic handling.

    Maps 1:1 to sub_status for now, but can diverge if frontend needs
    different grouping than display labels.
    """
    sub = determine_sub_status(
        syntax_valid, domain_exists, mx_found, smtp_valid, disposable, catch_all,
        score, domain, smtp_outcome, role_based, probe_mismatch
    )
    return sub.upper()  # e.g., MAILBOX_CONFIRMED, CATCH_ALL_MASKED