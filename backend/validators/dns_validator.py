"""
DNS validation utilities for email verification.
Provides synchronous and asynchronous DNS lookup functions for domain validation,
MX records, SPF records, and DMARC records.
"""

import asyncio
import dns.resolver
import dns.exception
from typing import List, Optional
from utils.config import settings
from utils.logging import get_logger

logger = get_logger(__name__)

# DNS configuration from settings with fallback defaults
DNS_SERVERS: list[str] = getattr(settings, 'DNS_SERVERS', [
    "8.8.8.8",        # Google Primary
    "1.1.1.1",        # Cloudflare Primary
    "8.8.4.4",        # Google Secondary
    "1.0.0.1",        # Cloudflare Secondary
])
DNS_TIMEOUT: float = getattr(settings, 'DNS_TIMEOUT', 1.5)


def _make_resolver(timeout: float = DNS_TIMEOUT) -> dns.resolver.Resolver:
    """
    Create a DNS resolver configured with our DNS servers and timeout settings.

    Args:
        timeout: DNS query timeout in seconds (defaults to DNS_TIMEOUT from settings)

    Returns:
        Configured dns.resolver.Resolver instance
    """
    r = dns.resolver.Resolver()
    r.nameservers = DNS_SERVERS
    r.timeout = timeout
    r.lifetime = timeout * 2
    return r

# Global resolver instance
_resolver = _make_resolver()


def check_domain_exists(domain: str) -> bool:
    """
    Check if a domain exists by querying for A or MX records.

    Args:
        domain: Domain name to check (will be lowercased and stripped)

    Returns:
        bool: True if domain has A or MX records, False otherwise

    Note:
        Returns False immediately for NXDOMAIN (domain doesn't exist)
        Continues on other errors (timeout, no answer, etc.) trying both record types
    """
    domain = domain.lower().strip()
    if not domain or "." not in domain:
        logger.debug("dns_invalid_domain", domain=domain)
        return False

    for rtype in ("A", "MX"):
        try:
            _resolver.resolve(domain, rtype)
            logger.debug("dns_domain_found", domain=domain, record_type=rtype)
            return True
        except dns.resolver.NXDOMAIN:
            logger.debug("dns_domain_not_found", domain=domain)
            return False
        except (dns.resolver.NoAnswer, dns.exception.Timeout, Exception) as exc:
            logger.debug("dns_query_failed", domain=domain, record_type=rtype, error=str(exc))
            continue

    logger.debug("dns_no_records_found", domain=domain)
    return False


def get_mx_records(domain: str) -> list[str]:
    """
    Get MX records for a domain, sorted by priority.

    Args:
        domain: Domain name to query (will be lowercased and stripped)

    Returns:
        list[str]: List of MX hostnames sorted by priority (lowest first).
                  Falls back to [domain] if A record exists but no MX records.
                  Returns empty list if domain doesn't exist.
    """
    domain = domain.lower().strip()
    if not domain or "." not in domain:
        logger.debug("dns_invalid_domain_for_mx", domain=domain)
        return []

    try:
        answers = _resolver.resolve(domain, "MX")
        records = sorted(answers, key=lambda r: r.preference)
        mx_list = [str(r.exchange).rstrip(".") for r in records]
        mx_list = [mx for mx in mx_list if mx and "." in mx]
        if mx_list:
            logger.debug("dns_mx_records_found", domain=domain, count=len(mx_list))
            return mx_list
    except dns.resolver.NXDOMAIN:
        logger.debug("dns_domain_not_found_for_mx", domain=domain)
        return []
    except (dns.resolver.NoAnswer, dns.exception.Timeout, Exception) as exc:
        logger.debug("dns_mx_query_failed", domain=domain, error=str(exc))
        pass

    # Fallback to A record if no MX records found
    try:
        _resolver.resolve(domain, "A")
        logger.debug("dns_mx_fallback_to_a", domain=domain)
        return [domain]
    except Exception as exc:
        logger.debug("dns_a_record_failed_for_mx_fallback", domain=domain, error=str(exc))
        pass

    logger.debug("dns_no_mx_or_a_records", domain=domain)
    return []


def get_spf_record(domain: str) -> Optional[str]:
    """
    Get SPF record for a domain.

    Args:
        domain: Domain name to query (will be lowercased and stripped)

    Returns:
        str | None: SPF record string if found, None otherwise
    """
    try:
        answers = _resolver.resolve(domain, "TXT")
        for record in answers:
            txt = str(record).strip('"')
            if txt.startswith("v=spf1"):
                logger.debug("dns_spf_record_found", domain=domain)
                return txt
    except Exception as exc:
        logger.debug("dns_spf_query_failed", domain=domain, error=str(exc))
        pass

    logger.debug("dns_no_spf_record", domain=domain)
    return None


def get_dmarc_record(domain: str) -> Optional[str]:
    """
    Get DMARC record for a domain.

    Args:
        domain: Domain name to query (will be lowercased and stripped)

    Returns:
        str | None: DMARC record string if found, None otherwise
    """
    try:
        answers = _resolver.resolve(f"_dmarc.{domain}", "TXT")
        for record in answers:
            txt = str(record).strip('"')
            if txt.startswith("v=DMARC1"):
                logger.debug("dns_dmarc_record_found", domain=domain)
                return txt
    except Exception as exc:
        logger.debug("dns_dmarc_query_failed", domain=domain, error=str(exc))
        pass

    logger.debug("dns_no_dmarc_record", domain=domain)
    return None


async def async_check_domain_exists(domain: str) -> bool:
    """
    Asynchronously check if a domain exists by querying for A or MX records.

    Args:
        domain: Domain name to check

    Returns:
        bool: True if domain has A or MX records, False otherwise
    """
    return await asyncio.to_thread(check_domain_exists, domain)


async def async_get_mx_records(domain: str) -> list[str]:
    """
    Asynchronously get MX records for a domain.

    Args:
        domain: Domain name to query

    Returns:
        list[str]: List of MX hostnames sorted by priority
    """
    return await asyncio.to_thread(get_mx_records, domain)


async def async_get_spf_record(domain: str) -> Optional[str]:
    """
    Asynchronously get SPF record for a domain.

    Args:
        domain: Domain name to query

    Returns:
        str | None: SPF record string if found, None otherwise
    """
    return await asyncio.to_thread(get_spf_record, domain)


async def async_get_dmarc_record(domain: str) -> Optional[str]:
    """
    Asynchronously get DMARC record for a domain.

    Args:
        domain: Domain name to query

    Returns:
        str | None: DMARC record string if found, None otherwise
    """
    return await asyncio.to_thread(get_dmarc_record, domain)