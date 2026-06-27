import asyncio
import dns.resolver
import dns.exception
from utils.logging import get_logger

logger = get_logger(__name__)

# Fast public DNS servers
DNS_SERVERS = [
    "8.8.8.8",        # Google Primary
    "1.1.1.1",        # Cloudflare Primary
    "8.8.4.4",        # Google Secondary
    "1.0.0.1",        # Cloudflare Secondary
]

def _make_resolver(timeout: float = 1.5) -> dns.resolver.Resolver:
    r = dns.resolver.Resolver()
    r.nameservers = DNS_SERVERS
    r.timeout = timeout
    r.lifetime = timeout * 2
    return r

_resolver = _make_resolver()


def check_domain_exists(domain: str) -> bool:
    domain = domain.lower().strip()
    if not domain or "." not in domain:
        return False

    for rtype in ("A", "MX"):
        try:
            _resolver.resolve(domain, rtype)
            return True
        except dns.resolver.NXDOMAIN:
            return False
        except (dns.resolver.NoAnswer, dns.exception.Timeout, Exception):
            continue
    return False


def get_mx_records(domain: str) -> list[str]:
    domain = domain.lower().strip()
    if not domain or "." not in domain:
        return []

    try:
        answers = _resolver.resolve(domain, "MX")
        records = sorted(answers, key=lambda r: r.preference)
        mx_list = [str(r.exchange).rstrip(".") for r in records]
        mx_list = [mx for mx in mx_list if mx and "." in mx]
        if mx_list:
            return mx_list
    except dns.resolver.NXDOMAIN:
        return []
    except (dns.resolver.NoAnswer, dns.exception.Timeout, Exception):
        pass

    # Fallback to A record
    try:
        _resolver.resolve(domain, "A")
        return [domain]
    except Exception:
        pass

    return []


def get_spf_record(domain: str) -> str | None:
    try:
        answers = _resolver.resolve(domain, "TXT")
        for record in answers:
            txt = str(record).strip('"')
            if txt.startswith("v=spf1"):
                return txt
    except Exception:
        pass
    return None


def get_dmarc_record(domain: str) -> str | None:
    try:
        answers = _resolver.resolve(f"_dmarc.{domain}", "TXT")
        for record in answers:
            txt = str(record).strip('"')
            if txt.startswith("v=DMARC1"):
                return txt
    except Exception:
        pass
    return None


async def async_check_domain_exists(domain: str) -> bool:
    return await asyncio.to_thread(check_domain_exists, domain)

async def async_get_mx_records(domain: str) -> list[str]:
    return await asyncio.to_thread(get_mx_records, domain)

async def async_get_spf_record(domain: str) -> str | None:
    return await asyncio.to_thread(get_spf_record, domain)

async def async_get_dmarc_record(domain: str) -> str | None:
    return await asyncio.to_thread(get_dmarc_record, domain)