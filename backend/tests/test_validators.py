"""
Unit tests for validators.
Run: pytest tests/ -v
"""
import pytest
from unittest.mock import patch, MagicMock


# ── Syntax validator ──────────────────────────────────────────────────────────

class TestSyntaxValidator:
    def test_valid_email(self):
        from validators.syntax_validator import validate_syntax
        ok, norm, domain = validate_syntax("John.Doe@Gmail.com")
        assert ok is True
        assert domain == "gmail.com"

    def test_invalid_email_no_at(self):
        from validators.syntax_validator import validate_syntax
        ok, norm, domain = validate_syntax("notanemail")
        assert ok is False
        assert norm is None

    def test_invalid_email_double_at(self):
        from validators.syntax_validator import validate_syntax
        ok, _, _ = validate_syntax("a@@b.com")
        assert ok is False

    def test_role_based_admin(self):
        from validators.syntax_validator import is_role_based
        assert is_role_based("admin@example.com") is True

    def test_role_based_normal(self):
        from validators.syntax_validator import is_role_based
        assert is_role_based("john@example.com") is False

    def test_role_based_support(self):
        from validators.syntax_validator import is_role_based
        assert is_role_based("support@company.com") is True


# ── Disposable checker ────────────────────────────────────────────────────────

class TestDisposableChecker:
    def test_known_disposable(self):
        from validators.disposable_checker import is_disposable
        assert is_disposable("mailinator.com") is True

    def test_known_disposable_yopmail(self):
        from validators.disposable_checker import is_disposable
        assert is_disposable("yopmail.com") is True

    def test_legit_domain(self):
        from validators.disposable_checker import is_disposable
        assert is_disposable("gmail.com") is False

    def test_legit_domain_corporate(self):
        from validators.disposable_checker import is_disposable
        assert is_disposable("company.com") is False


# ── Score calculator ──────────────────────────────────────────────────────────

class TestScoreCalculator:
    def test_perfect_score(self):
        from validators.score_calculator import calculate_score
        score = calculate_score(True, True, True, True, False, False)
        assert score == 100

    def test_zero_score_all_fail(self):
        from validators.score_calculator import calculate_score
        score = calculate_score(False, False, False, False, True, True)
        assert score == 0

    def test_partial_score_no_smtp(self):
        from validators.score_calculator import calculate_score
        score = calculate_score(True, True, True, False, False, False)
        assert score == 80

    def test_disposable_penalty(self):
        from validators.score_calculator import calculate_score
        score = calculate_score(True, True, True, True, True, False)
        assert score == 90

    def test_catch_all_penalty(self):
        from validators.score_calculator import calculate_score
        score = calculate_score(True, True, True, True, False, True)
        assert score == 90


class TestDetermineStatus:
    def test_verified_high_score(self):
        from validators.score_calculator import determine_status
        from models.models import EmailStatus
        status = determine_status(True, True, True, True, False, False, 100)
        assert status == EmailStatus.verified

    def test_invalid_no_syntax(self):
        from validators.score_calculator import determine_status
        from models.models import EmailStatus
        status = determine_status(False, False, False, False, False, False, 0)
        assert status == EmailStatus.invalid

    def test_risky_disposable(self):
        from validators.score_calculator import determine_status
        from models.models import EmailStatus
        status = determine_status(True, True, True, True, True, False, 90)
        assert status == EmailStatus.risky

    def test_risky_catch_all(self):
        from validators.score_calculator import determine_status
        from models.models import EmailStatus
        status = determine_status(True, True, True, True, False, True, 90)
        assert status == EmailStatus.risky


# ── DNS validator ─────────────────────────────────────────────────────────────

class TestDNSValidator:
    @patch("validators.dns_validator._resolver")
    def test_domain_exists(self, mock_resolver):
        mock_resolver.resolve.return_value = [MagicMock()]
        from validators.dns_validator import check_domain_exists
        assert check_domain_exists("gmail.com") is True

    @patch("validators.dns_validator._resolver")
    def test_domain_not_exists(self, mock_resolver):
        import dns.resolver
        mock_resolver.resolve.side_effect = dns.resolver.NXDOMAIN()
        from validators.dns_validator import check_domain_exists
        assert check_domain_exists("thisdomaindoesnotexist12345.com") is False

    @patch("validators.dns_validator._resolver")
    def test_mx_records_returned(self, mock_resolver):
        mx1 = MagicMock()
        mx1.preference = 10
        mx1.exchange = "mail.example.com."
        mock_resolver.resolve.return_value = [mx1]
        from validators.dns_validator import get_mx_records
        records = get_mx_records("example.com")
        assert records == ["mail.example.com"]

    @patch("validators.dns_validator._resolver")
    def test_mx_no_records(self, mock_resolver):
        import dns.resolver
        mock_resolver.resolve.side_effect = dns.resolver.NoAnswer()
        from validators.dns_validator import get_mx_records
        records = get_mx_records("example.com")
        assert records == []


# ── SMTP validator ────────────────────────────────────────────────────────────

class TestSMTPValidator:
    def test_empty_mx_list(self):
        from validators.smtp_validator import verify_smtp
        valid, catch_all = verify_smtp("test@example.com", [])
        assert valid is False
        assert catch_all is False

    @patch("validators.smtp_validator._smtp_check_with_retry")
    def test_smtp_valid(self, mock_check):
        mock_check.return_value = (True, False)
        from validators.smtp_validator import verify_smtp
        valid, catch_all = verify_smtp("john@gmail.com", ["gmail-smtp-in.l.google.com"])
        assert valid is True
        assert catch_all is False

    @patch("validators.smtp_validator._smtp_check_with_retry")
    def test_smtp_catch_all(self, mock_check):
        mock_check.return_value = (True, True)
        from validators.smtp_validator import verify_smtp
        valid, catch_all = verify_smtp("john@example.com", ["mail.example.com"])
        assert valid is True
        assert catch_all is True

    @patch("validators.smtp_validator._smtp_check_with_retry")
    def test_smtp_all_mx_fail(self, mock_check):
        mock_check.side_effect = Exception("Connection refused")
        from validators.smtp_validator import verify_smtp
        valid, catch_all = verify_smtp("john@example.com", ["mx1.example.com", "mx2.example.com"])
        assert valid is False


# ── Integration-style test for full pipeline (mocked I/O) ────────────────────

class TestEmailVerificationPipeline:
    @pytest.mark.asyncio
    @patch("services.email_service.async_check_domain_exists", return_value=True)
    @patch("services.email_service.async_get_mx_records", return_value=["mx.gmail.com"])
    @patch("services.email_service.async_verify_smtp", return_value=(True, False))
    async def test_full_pipeline_valid(self, mock_smtp, mock_mx, mock_domain):
        from services.email_service import verify_email
        from models.models import EmailStatus
        result = await verify_email("john@gmail.com")
        assert result.syntax_valid is True
        assert result.domain_exists is True
        assert result.mx_found is True
        assert result.smtp_valid is True
        assert result.status == EmailStatus.verified
        assert result.score == 100

    @pytest.mark.asyncio
    async def test_invalid_syntax(self):
        from services.email_service import verify_email
        from models.models import EmailStatus
        result = await verify_email("not-an-email")
        assert result.syntax_valid is False
        assert result.status == EmailStatus.invalid
        assert result.score == 0
