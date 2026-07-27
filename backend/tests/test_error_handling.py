"""
Tests for error handling in verify_email() pipeline.

Specifically tests that when an exception occurs mid-pipeline (after syntax
validation has passed), the response preserves:
- syntax_valid == True (the actual computed value)
- status == EmailStatus.error
- verification_error is set with a human-readable message
- Other check fields (domain_exists, mx_found, etc.) are None (unknown), not False

This prevents the bug where an internal error was incorrectly reported as
"Syntax: Issue Found" / "Not Recommended" / score 0 for perfectly valid emails.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime

from services.email_service import verify_email
from models.models import EmailStatus
from schemas.schemas import EmailVerifyResponse
from validators.smtp_validator import async_verify_smtp, SmtpResult, SmtpOutcome


class TestVerifyEmailErrorHandling:
    """Tests for error handling in the verify_email pipeline."""

    @pytest.mark.asyncio
    async def test_exception_mid_pipeline_preserves_syntax_valid(self):
        """
        Simulate an exception being thrown mid-pipeline (e.g., SMTP timeout)
        for a syntactically valid email, and assert the response has:
        - syntax_valid == True (preserved from before the exception)
        - status == EmailStatus.error
        - verification_error is set (not None/empty)
        - domain_exists, mx_found, smtp_valid, etc. are None (unknown), not False
        - score is None (unknown), not 0
        """
        email = "goyallala02@gmail.com"

        # Mock async_verify_smtp to raise an exception (simulating SMTP timeout/error)
        with patch('services.email_service.async_verify_smtp', new_callable=AsyncMock) as mock_smtp:
            mock_smtp.side_effect = Exception("SMTP connection timeout")

            # Also mock the DNS checks to avoid real I/O
            with patch('services.email_service.async_check_domain_exists', new_callable=AsyncMock) as mock_domain:
                with patch('services.email_service.async_get_mx_records', new_callable=AsyncMock) as mock_mx:
                    with patch('services.email_service.async_get_spf_record', new_callable=AsyncMock):
                        with patch('services.email_service.async_get_dmarc_record', new_callable=AsyncMock):
                            mock_domain.return_value = True
                            mock_mx.return_value = ["mx1.gmail.com", "mx2.gmail.com"]

                            result = await verify_email(email, force_fresh=True)

        # Assertions
        assert isinstance(result, EmailVerifyResponse), "Should return EmailVerifyResponse"

        # Syntax validation passed before the exception - should be preserved
        assert result.syntax_valid is True, f"syntax_valid should be True (preserved), got {result.syntax_valid}"

        # Status should be 'error', not 'invalid'
        assert result.status == EmailStatus.error, f"status should be 'error', got {result.status.value}"

        # Verification error should be set with a human-readable message
        assert result.verification_error is not None, "verification_error should be set"
        assert len(result.verification_error) > 0, "verification_error should not be empty"
        # Should contain the exception type, not a stack trace
        assert "Exception" in result.verification_error or "SMTP" in result.verification_error or "timeout" in result.verification_error.lower()

        # Other check fields should be None (unknown), not False (checked and failed)
        assert result.domain_exists is None, f"domain_exists should be None (unknown), got {result.domain_exists}"
        assert result.mx_found is None, f"mx_found should be None (unknown), got {result.mx_found}"
        assert result.smtp_valid is None, f"smtp_valid should be None (unknown), got {result.smtp_valid}"
        assert result.disposable is None, f"disposable should be None (unknown), got {result.disposable}"
        assert result.role_based is None, f"role_based should be None (unknown), got {result.role_based}"
        assert result.catch_all is None, f"catch_all should be None (unknown), got {result.catch_all}"

        # Score should be None (unknown), not 0
        assert result.score is None, f"score should be None (unknown), got {result.score}"

        # Sub-status, confidence, reason_code should be None
        assert result.sub_status is None, f"sub_status should be None, got {result.sub_status}"
        assert result.confidence is None, f"confidence should be None, got {result.confidence}"
        assert result.reason_code is None, f"reason_code should be None, got {result.reason_code}"

    @pytest.mark.asyncio
    async def test_exception_before_syntax_validation(self):
        """
        Test exception during syntax validation itself.
        Since syntax check is the first step and has no I/O, this is unlikely
        but ensures the error handling works even there.
        """
        email = "invalid-email"

        # Mock validate_syntax to raise an exception
        with patch('services.email_service.validate_syntax', side_effect=Exception("Syntax validator error")):
            result = await verify_email(email, force_fresh=True)

        assert isinstance(result, EmailVerifyResponse)
        # Syntax was not validated before exception
        assert result.syntax_valid is False  # Default when not computed
        assert result.status == EmailStatus.error
        assert result.verification_error is not None
        assert "Syntax" in result.verification_error or "Exception" in result.verification_error

    @pytest.mark.asyncio
    async def test_exception_during_dns_lookup(self):
        """
        Test exception during DNS lookup (after syntax check passed).
        """
        email = "user@example.com"

        with patch('services.email_service.async_check_domain_exists', new_callable=AsyncMock) as mock_domain:
            mock_domain.side_effect = Exception("DNS resolution failed")

            result = await verify_email(email, force_fresh=True)

        assert isinstance(result, EmailVerifyResponse)
        # Syntax was validated successfully before DNS
        assert result.syntax_valid is True
        assert result.status == EmailStatus.error
        assert result.verification_error is not None
        # DNS never completed, so these should be None
        assert result.domain_exists is None
        assert result.mx_found is None
        assert result.smtp_valid is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])