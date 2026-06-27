def detect_email_column(df):
    """
    Return the column name that most likely holds e‑mail addresses.
    Order of preference:
        1. Exact match (case‑insensitive, stripped) to "email"
        2. Contains "email" or "mail" (case‑insensitive)
        3. First column with at least one "@" in a sample of values
    Raises ValueError if no suitable column is found.
    """
    # Exact match first
    for col in df.columns:
        if str(col).strip().lower() == "email":
            return col

    # Partial match
    for col in df.columns:
        col_lower = str(col).lower()
        if "email" in col_lower or "mail" in col_lower:
            return col

    # Content fallback
    for col in df.columns:
        # Take a small sample to avoid expensive ops on huge frames
        sample = df[col].dropna().astype(str).head(10)
        if sample.str.contains("@").sum() >= 1:
            return col

    raise ValueError("No column resembling an e-mail address found.")