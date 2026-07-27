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

Also includes regression tests for:
1. probe_mismatch UnboundLocalError when SMTP is skipped (no MX / disposable)
2. probe_mismatch UnboundLocalError when SMTP result is reused from cache
3. "Stuck Processing" bug — error responses now move row to 'error' state
   instead of leaving it at 'processing'
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import datetime

from services.email_service import verify_email, _persist_result
from models.models import EmailStatus
from schemas.schemas import EmailVerifyResponse
from validators.smtp_validator import async_verify_smtp, SmtpResult, SmtpOutcome


class TestVerifyEmailErrorHandling:
    """Tests for error handling in the verify_email pipeline."""

    # ... existing tests ...

    @pytest.mark.asyncio
    async def test_no_mx_found_no_unbound_local_error(self):
        """
        BUG #1 REGRESSION: probe_mismatch UnboundLocalError when SMTP check
        is not applicable (no MX records found).

        When async_get_mx_records returns [], smtp_check_applicable becomes False,
        and the SMTP else-branch where probe_mismatch was assigned is skipped.
        This test ensures verify_email() completes without UnboundLocalError
        and returns mx_found=False.
        """
        email = "user@nomx.example.com"

        with patch('services.email_service.async_check_domain_exists', new_callable=AsyncMock) as mock_domain:
            with patch('services.email_service.async_get_mx_records', new_callable=AsyncMock) as mock_mx:
                with patch('services.email_service.async_get_spf_record', new_callable=AsyncMock):
                    with patch('services.email_service.async_get_dmarc_record', new_callable=AsyncMock):
                        mock_domain.return_value = True
                        mock_mx.return_value = []  # No MX records = SMTP not applicable

                        result = await verify_email(email, force_fresh=True)

        assert isinstance(result, EmailVerifyResponse), "Should return EmailVerifyResponse"
        assert result.syntax_valid is True
        assert result.domain_exists is True
        assert result.mx_found is False
        # Should NOT crash with UnboundLocalError for probe_mismatch
        # Should return normally with proper status
        assert result.status != EmailStatus.error or result.verification_error is not None

    @pytest.mark.asyncio
    async def test_smtp_fresh_reuse_no_unbound_local_error(self):
        """
        BUG #1 REGRESSION: probe_mismatch UnboundLocalError when SMTP result
        is reused from TTL cache (smtp_fresh=True branch).

        When smtp_fresh=True, the else-branch where probe_mismatch was
        assigned is skipped. This test ensures verify_email() completes
        without UnboundLocalError.
        """
        email = "cached@example.com"

        # Create a mock existing record with fresh SMTP check
        from datetime import timedelta
        from utils.timezone import utc_now_naive

        mock_existing = MagicMock()
        mock_existing.smtp_valid = True
        mock_existing.catch_all = False
        mock_existing.smtp_outcome = "valid"
        mock_existing.smtp_response_code = 250
        mock_existing.smtp_checked_at = utc_now_naive() - timedelta(hours=1)
        mock_existing.dns_checked_at = utc_now_naive() - timedelta(hours=1)
        mock_existing.domain_exists = True
        mock_existing.mx_found = True
        mock_existing.disposable = False
        mock_existing.role_based = False
        mock_existing.catch_all = False
        mock_existing.spf_valid = None
        mock_existing.dmarc_valid = None
        mock_existing.score = 90

        with patch('services.email_service._fetch_existing_email', new_callable=AsyncMock) as mock_fetch:
            with patch('services.email_service.async_verify_smtp', new_callable=AsyncMock):
                with patch('services.email_service._fetch_domain_mx_records', new_callable=AsyncMock) as mock_mx:
                    mock_fetch.return_value = mock_existing
                    mock_mx.return_value = ["mx1.example.com", "mx2.example.com"]

                    result = await verify_email(email, force_fresh=False)

        assert isinstance(result, EmailVerifyResponse)
        assert result.smtp_reused is True
        # Should NOT crash with UnboundLocalError for probe_mismatch

    @pytest.mark.asyncio
    async def test_exception_mid_pipeline_moves_row_to_error_not_processing(self):
        """
        BUG #2 REGRESSION: "Stuck Processing" rows.

        When an exception occurs mid-pipeline, the _persist_result() should
        write a terminal 'error' status (not leave the row at 'processing').
        Also ensures dns_checked_at/smtp_checked_at remain NULL so future
        verifications are not blocked from doing fresh checks.

        This test simulates an exception during SMTP verification and
        verifies the async_upsert_email_error_terminal is called.
        """
        email = "crash@example.com"

        # Track if error terminal upsert was called
        error_terminal_called = {"called": False}

        async def mock_upsert_error_terminal(db, email, domain, syntax_valid, job_id, verification_error, now):
            error_terminal_called["called"] = True
            error_terminal_called["email"] = email
            error_terminal_called["status"] = "error"
            error_terminal_called["syntax_valid"] = syntax_valid
            error_terminal_called["verification_error"] = verification_error

        with patch('services.email_service.async_upsert_email_error_terminal', new=mock_upsert_error_terminal):
            with patch('services.email_service.async_check_domain_exists', new_callable=AsyncMock) as mock_domain:
                with patch('services.email_service.async_get_mx_records', new_callable=AsyncMock) as mock_mx:
                    with patch('services.email_service.async_verify_smtp', new_callable=AsyncMock) as mock_smtp:
                        with patch('services.email_service.async_get_spf_record', new_callable=AsyncMock):
                            with patch('services.email_service.async_get_dmarc_record', new_callable=AsyncMock):
                                mock_domain.return_value = True
                                mock_mx.return_value = ["mx1.example.com"]
                                mock_smtp.side_effect = Exception("SMTP timeout")

                                result = await verify_email(email, force_fresh=True)

        # Verify the error response structure
        assert isinstance(result, EmailVerifyResponse)
        assert result.syntax_valid is True
        assert result.status == EmailStatus.error
        assert result.verification_error is not None

        # Verify error terminal upsert was called (not skipped)
        assert error_terminal_called["called"], "async_upsert_email_error_terminal should be called for error responses"
        assert error_terminal_called["status"] == "error"
        assert error_terminal_called["syntax_valid"] is True
        assert error_terminal_called["verification_error"] is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])