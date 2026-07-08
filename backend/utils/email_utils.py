import pandas as pd
import logging

logger = logging.getLogger(__name__)


def detect_email_column(df: pd.DataFrame) -> str:
    """
    Return the column name that most likely holds e-mail addresses.
    Order of preference:
        1. Exact match (case-insensitive, stripped) to "email"
        2. Contains "email" or "mail" (case-insensitive)
        3. First column with at least one "@" in a sample of values
    Raises ValueError if no suitable column is found.

    Args:
        df: pandas DataFrame to search for email column

    Returns:
        str: Name of the column most likely containing email addresses

    Raises:
        ValueError: If no column resembling an email address is found
    """
    if df.empty:
        raise ValueError("DataFrame is empty")

    # Exact match first
    for col in df.columns:
        if str(col).strip().lower() == "email":
            logger.debug(f"Found exact email column match: {col}")
            return col

    # Partial match
    for col in df.columns:
        col_lower = str(col).lower()
        if "email" in col_lower or "mail" in col_lower:
            logger.debug(f"Found partial email column match: {col}")
            return col

    # Content fallback
    # Use a reasonable sample size to balance performance and accuracy
    SAMPLE_SIZE = min(10, len(df))
    for col in df.columns:
        # Take a small sample to avoid expensive ops on huge frames
        sample = df[col].dropna().astype(str).head(SAMPLE_SIZE)
        if sample.str.contains("@").sum() >= 1:
            logger.debug(f"Found email column by content match: {col}")
            return col

    raise ValueError("No column resembling an e-mail address found.")