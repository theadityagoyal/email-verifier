"""
Shared CSV/Excel reading logic for bulk email uploads.

Previously this exact encoding-fallback / malformed-CSV-recovery logic was
copy-pasted (with small drift between copies) in three places:
  - api/v1/endpoints/bulk.py           (_read_file)
  - api/external/v1/endpoints/bulk.py  (_read_file)
  - tasks/bulk_processor.py            (inline in process_bulk_job_sync)

This module is the single source of truth for all three.
"""
import io
import os
import re

import pandas as pd
from pandas.errors import ParserError

SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls"]

# Encodings tried in order for CSV files that aren't valid UTF-8.
_CSV_ENCODINGS = ["utf-8", "latin-1", "cp1252"]


class FileReadError(Exception):
    """Raised when an uploaded file can't be parsed into a DataFrame.
    Callers (API endpoints, background jobs) are responsible for turning
    this into whatever error shape they need (HTTPException, job failure, ...)."""
    pass


def is_supported_filename(filename: str) -> bool:
    filename_lower = (filename or "").lower()
    return any(filename_lower.endswith(ext) for ext in SUPPORTED_EXTENSIONS)


def sanitize_filename(filename: str) -> str:
    """
    Sanitize a client-provided filename for safe filesystem use.

    - Strips any path components (dirname, .., /, \\)
    - Keeps only the basename
    - Removes control characters and other unsafe chars
    - Limits length to 255 chars (common FS limit)
    - Falls back to "upload" if result is empty

    This is intentionally strict — the original filename is stored in the
    Job record (job.file_name) for display/download purposes, but the
    actual file on disk uses this sanitized version.
    """
    if not filename:
        return "upload"

    # Get basename only — strips any path separators and .. sequences
    basename = os.path.basename(filename)

    # Replace any remaining non-printable/control chars and path separators
    # with underscore. Keep alphanumeric, dot, hyphen, underscore.
    # Also strip leading dots (hidden files).
    sanitized = re.sub(r'[^\w.\-]', '_', basename).lstrip('.')

    # Limit length (most filesystems have 255 byte/char limit per component)
    if len(sanitized) > 255:
        name, ext = os.path.splitext(sanitized)
        sanitized = name[:255 - len(ext)] + ext

    return sanitized or "upload"


def read_upload_file(content: bytes, filename: str) -> pd.DataFrame:
    """
    Read a CSV or Excel upload into a pandas DataFrame.

    CSV files are tried against a small list of common encodings; if a
    given encoding raises a ParserError (malformed/inconsistent CSV), we
    fall back to treating the file as a single email-per-line list instead
    of failing outright.

    Args:
        content: raw file bytes
        filename: original filename (used only to determine the format)

    Returns:
        pd.DataFrame

    Raises:
        FileReadError: if the file can't be read as CSV/Excel at all
    """
    filename_lower = (filename or "").lower()

    if filename_lower.endswith(".csv"):
        return _read_csv(content)

    if filename_lower.endswith((".xlsx", ".xls")):
        try:
            return pd.read_excel(io.BytesIO(content))
        except Exception as e:
            raise FileReadError(f"Excel file reading failed: {str(e)}")

    raise FileReadError(f"Unsupported file format. Only {', '.join(SUPPORTED_EXTENSIONS)} accepted.")


def _read_csv(content: bytes) -> pd.DataFrame:
    last_error: Exception | None = None

    for encoding in _CSV_ENCODINGS:
        try:
            return pd.read_csv(io.BytesIO(content), encoding=encoding)
        except UnicodeDecodeError as e:
            last_error = e
            continue
        except ParserError as e:
            last_error = e
            # Fallback: treat each non-empty line as a single column (email)
            try:
                text_content = content.decode(encoding, errors="replace")
            except UnicodeDecodeError:
                text_content = content.decode("utf-8", errors="replace")

            lines = [line.strip() for line in text_content.splitlines() if line.strip() != ""]
            if not lines:
                return pd.DataFrame(columns=["email"])

            header = lines[0]
            data_lines = lines[1:] if "@" not in header or header.lower().startswith("email") else lines
            col_name = "email" if header.lower() == "email" else header
            return pd.DataFrame({col_name: data_lines})

    raise FileReadError(f"Could not decode CSV file with common encodings: {str(last_error)}")
