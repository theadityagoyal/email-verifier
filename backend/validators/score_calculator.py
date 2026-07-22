import math
import re
from models.models import EmailStatus

TRUSTED_DOMAINS = frozenset({

    # ── Apple ─────────────────────────────────────────────────────────────────
    "icloud.com", "me.com", "mac.com",

    # ── Privacy / Secure ──────────────────────────────────────────────────────
    "protonmail.com", "protonmail.ch", "proton.me", "pm.me",
    "tutanota.com", "tutanota.de", "tutamail.com",
    "fastmail.com", "fastmail.fm", "fastmail.net",
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

    # ── Chinese ───────────────────────────────────────────────────────────────
    "qq.com", "163.com", "126.com", "sina.com",
    "sohu.com", "foxmail.com", "yeah.net",

    # ── Japanese ──────────────────────────────────────────────────────────────
    "docomo.ne.jp", "softbank.ne.jp", "ezweb.ne.jp",
    "yahoo.co.jp", "nifty.com",

    # ── Others Global ─────────────────────────────────────────────────────────
    "aol.com", "aim.com", "zoho.com",
    "iname.com", "mail.com", "email.com",
    "usa.com", "dr.com", "myself.com",

    # ── Indian Top Companies ──────────────────────────────────────────────────
    "tcs.com", "infosys.com", "wipro.com", "hcltech.com",
    "techmahindra.com", "ltimindtree.com", "mphasis.com",
    "hexaware.com", "persistent.com", "kpit.com",
    "tatamotors.com", "tatasteel.com", "tatapower.com",
    "tatacommunications.com", "tatacapital.com",
    "relianceindustries.com", "ril.com", "jio.com",
    "relianceretail.com", "reliancejio.com",
    "adani.com", "adanigroup.com", "adaniports.com",
    "mahindra.com", "mahindraauto.com", "techm.com",
    "bajaj.com", "bajajfinserv.com", "bajajfinance.in",
    "hdfcbank.com", "hdfc.com", "hdfclife.com",
    "icicibank.com", "iciciprulife.com", "icicilombard.com",
    "axisbank.com", "axissecurities.com",
    "sbi.co.in", "sbigeneral.in", "sbilife.co.in",
    "kotak.com", "kotaklife.com", "kotaksecurities.com",
    "indusind.com", "yesbank.in", "bandhanbank.com",
    "ongc.co.in", "bpcl.in", "iocl.com", "hpcl.com",
    "ntpc.co.in", "powergrid.in", "nhpc.in",
    "airtelindia.com", "airtel.in", "bhartiairtel.com",
    "vodafone.in", "idea.adityabirla.com",
    "flipkart.com", "myntra.com", "meesho.com",
    "snapdeal.com", "paytm.com", "paytmmall.com",
    "zomato.com", "swiggy.com", "dunzo.com",
    "ola.com", "olacabs.com", "olaelectric.com",
    "byju.com", "byjus.com", "unacademy.com", "vedantu.com",
    "razorpay.com", "zerodha.com", "groww.in",
    "policybazaar.com", "acko.com", "digit.in",
    "naukri.com", "infoedge.com", "99acres.com",
    "makemytrip.com", "goibibo.com", "cleartrip.com",
    "irctc.co.in", "indianrailways.gov.in",
    "ultratech.in", "ambujacement.com", "shreecement.com",
    "asianpaints.com", "bergerpaints.com",
    "drreddy.com", "sunpharma.com", "cipla.com",
    "lupin.com", "auropharma.com", "torrentpharma.com",
    "itc.in", "itcportal.com", "hindustan-unilever.com",
    "nestle.in", "britannia.co.in", "dabur.com",
    "marico.com", "godrej.com", "godrejcp.com",
    "apollohospitals.com", "fortishealthcare.com",
    "maxhealthcare.in", "medanta.org",

    # ── Global Top Companies ──────────────────────────────────────────────────
    "apple.com", "microsoft.com", "amazon.com", "meta.com",
    "netflix.com", "tesla.com", "nvidia.com", "amd.com",
    "intel.com", "ibm.com", "oracle.com", "salesforce.com",
    "adobe.com", "spotify.com", "twitter.com", "x.com",
    "linkedin.com", "uber.com", "airbnb.com", "stripe.com",
    "shopify.com", "zoom.us", "slack.com", "dropbox.com",
    "paypal.com", "ebay.com", "walmart.com", "target.com",
    "mcdonalds.com", "starbucks.com", "nike.com", "adidas.com",
    "samsung.com", "sony.com", "lg.com", "panasonic.com",
    "toyota.com", "honda.com", "bmw.com", "mercedes-benz.com",
    "volkswagen.com", "ford.com", "gm.com", "hyundai.com",
    "jpmorgan.com", "goldmansachs.com", "morganstanley.com",
    "citigroup.com", "bankofamerica.com", "wellsfargo.com",
    "hsbc.com", "barclays.com", "deutschebank.com",
    "mckinsey.com", "bcg.com", "bain.com", "deloitte.com",
    "pwc.com", "ey.com", "kpmg.com", "accenture.com",
    "capgemini.com", "cognizant.com", "cgi.com",
    "unilever.com", "pg.com", "nestle.com", "coca-cola.com",
    "pepsi.com", "pepsico.com", "kraft.com", "mondelez.com",
    "pfizer.com", "johnson.com", "novartis.com", "roche.com",
    "astrazeneca.com", "gsk.com", "abbvie.com", "merck.com",
    "3m.com", "honeywell.com", "siemens.com", "ge.com",
    "boeing.com", "airbus.com", "lockheedmartin.com",
    "shell.com", "bp.com", "exxonmobil.com", "chevron.com",
    "total.com", "totalenergies.com",

})

# Minimum score guaranteed for a trusted domain that passed syntax and isn't
# disposable — keeps it inside the "Safe" bucket (probably_valid/trusted/
# deliverable, i.e. score > 75) regardless of how harshly the username
# pattern heuristics penalize it. Reputation bonuses alone weren't enough:
# a known-good domain like gmail.com could still get dragged into "risky"
# (uncertain, score<=65) purely from a random-looking local part, which
# makes no sense for a domain we already trust.
TRUSTED_DOMAIN_SCORE_FLOOR = 76

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
) -> tuple[int, dict]:
    """
    Returns (final_score, username_analysis)
    """

    # Username quality pehle analyze karo
    username_analysis = analyze_username_quality(username) if username else {
        "score": 100, "penalty": 0, "flags": [], "verdict": "clean"
    }
    penalty = username_analysis["penalty"]

    # Disposable = straight 0 (overrides trust — a disposable domain is
    # never safe, even if it happened to be in TRUSTED_DOMAINS)
    if disposable:
        return 0, username_analysis

    # Syntax fail = 0
    if not syntax_valid:
        return 0, username_analysis

    # Calculate base score based on validation results
    base_score = 0

    # Domain nahi = 40
    if not domain_exists:
        base_score = 40
    # Domain hai but MX nahi = 60
    elif not mx_found:
        base_score = 60
    # MX hai + Catch-All = 70
    elif catch_all:
        base_score = 70
    # MX hai + SMTP fail = 80
    elif not smtp_valid:
        base_score = 80
    # MX hai + SMTP pass = 100
    else:
        base_score = 100

    is_trusted = domain.lower() in TRUSTED_DOMAINS

    # Apply trusted domain bonus (+10, max 100)
    trusted_bonus = 10 if is_trusted else 0
    score_with_trusted_bonus = min(100, base_score + trusted_bonus)

    # Apply username quality penalty. Trusted domains get a score floor so
    # reputation bonus + username penalty can never drag a known-good
    # domain into the risky/unsafe bucket (see TRUSTED_DOMAIN_SCORE_FLOOR).
    if is_trusted:
        final_score = max(TRUSTED_DOMAIN_SCORE_FLOOR, score_with_trusted_bonus - penalty)
    else:
        final_score = max(0, score_with_trusted_bonus - penalty)

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
