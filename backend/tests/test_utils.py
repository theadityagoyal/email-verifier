import pytest
import pandas as pd
from utils.email_utils import detect_email_column

def test_detect_exact_match():
    df = pd.DataFrame({"email": ["a@b.com"], "other": [1]})
    assert detect_email_column(df) == "email"

def test_detect_exact_match_with_spaces():
    df = pd.DataFrame({"  email  ": ["a@b.com"], "foo": [2]})
    assert detect_email_column(df) == "  email  "

def test_detect_partial_email():
    df = pd.DataFrame({"e_mail": ["a@b.com"], "mail_box": [3]})
    # first column containing 'email' or 'mail' is e_mail
    assert detect_email_column(df) == "e_mail"

def test_detect_partial_mail():
    df = pd.DataFrame({"mail": ["a@b.com"], "emailx": [4]})
    # mail matches first
    assert detect_email_column(df) == "mail"

def test_detect_content_fallback():
    df = pd.DataFrame({"col1": ["foo", "bar"], "col2": ["not@", "alice@example.com"]})
    # No column name matches, but col2 has @ in second row
    assert detect_email_column(df) == "col2"

def test_detect_no_column():
    df = pd.DataFrame({"foo": [1,2], "bar": ["a","b"]})
    with pytest.raises(ValueError, match="No column resembling an e-mail address"):
        detect_email_column(df)

def test_detect_case_insensitive_name():
    df = pd.DataFrame({"EMAIL": ["a@b.com"]})
    assert detect_email_column(df) == "EMAIL"

def test_detect_multiple_candidates_returns_first_match():
    df = pd.DataFrame({"mail": ["a@b.com"], "e_mail": ["c@d.com"], "other": [5]})
    # According to algorithm: exact match first (none), then partial: mail column matches 'mail', so returns mail
    assert detect_email_column(df) == "mail"