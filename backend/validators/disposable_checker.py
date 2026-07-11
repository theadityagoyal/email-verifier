"""
Disposable email domain checker.
Auto-fetches latest list from internet + fallback hardcoded list.
List is cached in memory and refreshed every 24 hours.
"""

import threading
import time
import urllib.request
from typing import Iterator
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# ── Fallback hardcoded list (used if internet fetch fails) ───────────────────
FALLBACK_DOMAINS: frozenset[str] = frozenset({
    "mailinator.com", "guerrillamail.com", "temp-mail.org",
    "throwam.com", "yopmail.com", "sharklasers.com", "trashmail.com",
    "trashmail.me", "trashmail.at", "trashmail.io", "trashmail.net",
    "dispostable.com", "spamgourmet.com", "maildrop.cc", "mailnull.com",
    "discard.email", "tempinbox.com", "fakeinbox.com", "mailnesia.com",
    "mintemail.com", "tempr.email", "spamex.com", "getairmail.com",
    "10minutemail.com", "10minutemail.net", "20minutemail.com",
    "mailsac.com", "tempmail.com", "throwam.com", "vtmpj.com",
    "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
    "guerrillamail.net", "guerrillamail.org", "spam4.me",
    "filzmail.de", "trbvm.com", "spaml.de", "wegwerfmail.de",
    "wegwerfmail.net", "wegwerfmail.org", "33mail.com",
    "byom.de", "deadaddress.com", "despam.it", "discardmail.com",
    "discardmail.de", "disposableaddress.com", "dispomail.eu",
    "dodgit.com", "donemail.ru", "dropit.in", "emailfake.com",
    "emailtemporanea.com", "emailtemporaria.com", "emailthe.net",
    "emailtmp.com", "emkei.cz", "ephemail.net", "etranquil.com",
    "evopo.com", "explodemail.com", "fake-box.com",
    "fakemailgenerator.com", "fast-email.com", "flurre.com",
    "flyspam.com", "freemail.ms", "garliclife.com", "get2mail.fr",
    "getonemail.com", "giantmail.de", "gishpuppy.com",
    "goemailgo.com", "gotmail.net", "gotmail.org", "haltospam.com",
    "herp.in", "hidemail.de", "hidzz.com", "hmamail.com",
    "ieatspam.eu", "ieatspam.info", "iheartspam.org",
    "inbax.tk", "inboxalias.com", "inboxclean.com",
    "incognitomail.com", "incognitomail.net", "incognitomail.org",
    "jetable.com", "jetable.fr.nf", "jetable.net", "jetable.org",
    "kasmail.com", "keepmymail.com", "killmail.com", "killmail.net",
    "klzlk.com", "koszmail.pl", "kurzepost.de", "link2mail.net",
    "litedrop.com", "lol.ovpn.to", "lolfreak.net",
    "lortemail.dk", "luggemail.com", "maboard.com",
    "mail-filter.com", "mail-temporaire.fr", "mail1a.de",
    "mail2rss.org", "mail333.com", "mailbidon.com",
    "mailbucket.org", "mailcat.biz", "mailcatch.com",
    "mailde.de", "mailde.info", "mailexpire.com",
    "mailfall.com", "mailfreeonline.com", "mailin8r.com",
    "mailinatar.com", "mailinater.com", "mailinator2.com",
    "mailincubator.com", "mailismagic.com", "mailme.ir",
    "mailme.lv", "mailme24.com", "mailmetrash.com",
    "mailmoat.com", "mailnew.com", "mailorg.org",
    "mailpick.biz", "mailrock.biz", "mailscrap.com",
    "mailseal.de", "mailshell.com", "mailsiphon.com",
    "mailslite.com", "mailsource.info", "mailtemp.info",
    "mailtome.de", "mailtothis.com", "mailtrash.net",
    "mailtv.net", "mailtv.tv", "mailzilla.com", "mailzilla.org",
    "makemetheking.com", "manybrain.com", "mbx.cc",
    "meinspamschutz.de", "meltmail.com", "messagebeamer.de",
    "mierdamail.com", "moburl.com", "moncourrier.fr.nf",
    "monemail.fr.nf", "monmail.fr.nf", "msgos.com",
    "mt2009.com", "mt2014.com", "my10minutemail.com",
    "mycleaninbox.net", "mymail-in.net", "mymailoasis.com",
    "mynetstore.de", "mypacks.net", "mypartyclip.de",
    "myphantomemail.com", "myspamless.com", "mytemp.email",
    "mytempemail.com", "mytempmail.com", "tempinbox.com",
    "spamgourmet.com", "spamspot.com", "spam4.me",
    "0-mail.com", "0815.ru", "0clickemail.com", "0wnd.net",
    "0wnd.org", "10minutemail.co.za", "10minutemail.de",
    "123-m.com", "1fsdfdsfsdf.tk", "1pad.de", "20mail.it",
    "21cn.com", "2fdgdfgdfgdf.tk", "2prong.com",
    "30minutemail.com", "3d-painting.com", "3mail.rocks",
    "4warding.com", "5ghgfhyfgbhfgh.tk", "6hjgjhgkilkj.tk",
    "6paq.com", "6url.com", "75hosting.com", "7tags.com",
    "7tenan.com", "9ox.net", "a-bc.net", "abyssmail.com",
    "afrobacon.com", "agedmail.com", "ajaxapp.net", "ama-trade.de",
    "amilegit.com", "amiri.net", "amiriindustries.com",
    "anonbox.net", "anonmails.de", "anonymail.dk",
    "anonymbox.com", "antichef.com", "antichef.net",
    "antireg.ru", "antispam.de", "antispammail.de",
    "armyspy.com", "artman-conception.com", "azmeil.tk",
    "baxomale.hm.cx", "beefmilk.com", "bigstring.com",
    "binkmail.com", "bio-muesli.net", "bobmail.info",
    "bodhi.lawlita.com", "bofthew.com", "bootybay.de",
    "boun.cr", "bouncr.com", "breakthru.com", "brefmail.com",
    "bsnow.net", "bspamfree.org", "bugmenot.com",
    "bumpymail.com", "bund.us", "burnthespam.info",
    "burstmail.info", "buymoreplays.com", "buyusedlibrarybooks.org",
    "chacuo.net", "chammy.info", "checked.com", "checkmail.ml",
    "cheersmail.com", "chewiemail.com", "chogmail.com",
    "choicemail1.com", "clrmail.com", "cmail.club",
    "cmail.com", "cmail.net", "cmail.org",
    "cool.fr.nf", "courriel.fr.nf", "courrieltemporaire.com",
    "crapmail.org", "crazymailing.com", "cubiclink.com",
    "curryworld.de", "cust.in", "dacoolest.com",
    "dandikmail.com", "dayrep.com", "dcemail.com",
    "deadspam.com", "deagot.com", "dealja.com",
    "delikkt.de", "despammed.com", "devnullmail.com",
    "dfgh.net", "digitalsanctuary.com", "dingbone.com",
    "disposableemailaddresses.com", "disposableinbox.com",
    "disposed.it", "disposemail.com", "divermail.com",
    "dm.w3internet.co.uk", "dmtc.edu.pl", "dog.com",
    "dominozzermail.com", "dontregyou.com", "dotman.de",
    "drdrb.com", "drdrb.net",
    "dsiplus.net", "duck2.club", "durandinterstellar.com",
    "duskmail.com", "e-mail.com.ar", "e-mail.ru",
    "e4ward.com", "easytrashmail.com", "ee1.pl",
    "eelmail.com", "einmalmail.de", "einrot.com",
    "einrot.de", "eintagsmail.de", "email60.com",
    "emaildienst.de", "emailgo.de", "emailias.com",
    "emailigo.com", "emailinfive.com", "emailisvalid.com",
    "emailkill.com", "emailll.com", "emailmiser.com",
    "emailnope.com", "emailo.pro", "emailproxsy.com",
    "emailresort.com", "emails.ga", "emailsensei.com",
    "emailspam.cf", "emailspam.ga", "emailspam.gq",
    "emailspam.ml", "emailspam.tk", "emailtea.com",
    "emailtemporario.com.br", "emailto.de", "emailure.net",
    "emailx.at.hm", "emailxfer.com", "emailz.cf",
    "emailz.ga", "emailz.gq", "emailz.ml",
    "email.org", "emeail.com", "emi.cx",
})

# ── Live fetched domains (from internet) ─────────────────────────────────────
_live_domains: set[str] = set()
_last_fetch_time: float = 0
_fetch_lock = threading.Lock()
_CACHE_TTL = getattr(settings, 'DISPOSABLE_CACHE_TTL', 86400)  # 24 hours

# Free public lists of disposable domains
_SOURCES: list[str] = getattr(settings, 'DISPOSABLE_SOURCES', [
    "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf",
    "https://raw.githubusercontent.com/FGRibreau/mailchecker/master/list.txt",
])


def _fetch_live_domains() -> set[str]:
    """Fetch disposable domains from public GitHub lists.

    Fetches from multiple sources and returns the union of all domains found.
    Each source is fetched with a 10-second timeout to prevent hanging.

    Returns:
        set[str]: Set of disposable domains (lowercased, stripped)
    """
    domains: set[str] = set()
    for url in _SOURCES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "EmailVerifier/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:  # 10s timeout to prevent hanging
                content = resp.read().decode("utf-8")
                for line in content.splitlines():
                    line = line.strip().lower()
                    if line and not line.startswith("#") and "." in line:
                        domains.add(line)
            logger.info("disposable_list_fetched", source=url, count=len(domains))
        except Exception as exc:
            logger.warning("disposable_list_fetch_failed", source=url, error=str(exc))
    return domains


def _refresh_if_needed() -> None:
    """Refresh live domains list if cache expired."""
    global _live_domains, _last_fetch_time

    now = time.time()
    if now - _last_fetch_time < _CACHE_TTL:
        return

    with _fetch_lock:
        # Double-check after acquiring lock
        if time.time() - _last_fetch_time < _CACHE_TTL:
            return

        logger.info("disposable_list_refreshing")
        fetched = _fetch_live_domains()
        if fetched:
            _live_domains = fetched
            _last_fetch_time = time.time()
            logger.info("disposable_list_updated", total=len(_live_domains))
        else:
            # Fetch failed — use fallback, retry in 1 hour
            _last_fetch_time = time.time() - _CACHE_TTL + 3600
            logger.warning("disposable_list_using_fallback")


def _init_background() -> None:
    """Fetch list in background thread on startup so API isn't blocked."""
    t = threading.Thread(target=_refresh_if_needed, daemon=True)
    t.start()


# Start background fetch immediately on import
_init_background()


def _domain_and_parents(domain: str) -> Iterator[str]:
    """
    Yield the domain itself and each of its parent domains, e.g. for
    "mail.xyz.mailinator.com" yields:
        "mail.xyz.mailinator.com", "xyz.mailinator.com", "mailinator.com"
    (stops before the bare TLD). This lets a listed disposable domain like
    "mailinator.com" also catch subdomains such as "xyz.mailinator.com" that
    a service might use for per-user inboxes, which an exact-match check
    alone would miss.
    """
    parts = domain.split(".")
    for i in range(len(parts) - 1):
        yield ".".join(parts[i:])


def get_disposable_stats() -> dict:
    """
    Get statistics about the disposable domain list.

    Returns:
        dict: Statistics including count, age, and source info
    """
    now = time.time()
    age_seconds = now - _last_fetch_time if _last_fetch_time > 0 else -1

    return {
        "live_domains_count": len(_live_domains),
        "fallback_domains_count": len(FALLBACK_DOMAINS),
        "total_unique_domains": len(_live_domains.union(FALLBACK_DOMAINS)),
        "last_update_seconds_ago": age_seconds if age_seconds >= 0 else None,
        "cache_ttl_seconds": _CACHE_TTL,
        "sources": _SOURCES,
        "is_expired": age_seconds > _CACHE_TTL if _last_fetch_time > 0 else True
    }


def refresh_disposable_list() -> bool:
    """
    Manually trigger a refresh of the disposable domain list.

    Returns:
        bool: True if refresh was successful, False otherwise
    """
    logger.info("manual_refresh_triggered")
    old_count = len(_live_domains)
    # Force refresh by making cache appear expired
    global _last_fetch_time
    _last_fetch_time = 0
    _refresh_if_needed()
    new_count = len(_live_domains)
    logger.info("manual_refresh_completed", old_count=old_count, new_count=new_count)
    return new_count > 0


def is_disposable(domain: str) -> bool:
    """
    Check if domain (or any of its parent domains) is disposable.
    Uses live fetched list (100,000+ domains) + fallback hardcoded list.
    Matches subdomains of known disposable domains too, e.g. checking
    "xyz.mailinator.com" will match because "mailinator.com" is listed.
    """
    domain = domain.lower().strip()
    if not domain:
        return False

    # Fast path: exact match against fallback (instant, no I/O)
    if domain in FALLBACK_DOMAINS:
        return True

    _refresh_if_needed()
    if domain in _live_domains:
        return True

    # Subdomain match: walk up the domain hierarchy
    for candidate in _domain_and_parents(domain):
        if candidate == domain:
            continue  # already checked above
        if candidate in FALLBACK_DOMAINS or candidate in _live_domains:
            return True

    return False
