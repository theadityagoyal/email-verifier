/**
 * Lightweight, best-effort CLIENT-SIDE preview of a selected upload file,
 * purely for UI display before the file is actually uploaded (the "Total
 * Rows / Email Column / Duplicates / Est. Time" mini-stats on UploadZone).
 *
 * IMPORTANT: this is a UI convenience only — it never talks to the backend
 * and never affects the real upload in any way. The backend's own
 * file_utils.py / email_utils.py (read_upload_file + detect_email_column)
 * remain the single source of truth for what actually gets processed. If
 * this preview and the backend ever disagree (e.g. a malformed CSV), the
 * backend's result after upload is what counts — this is just a heads-up.
 *
 * CSV/TXT: parsed with a simple line-split (no quoted-comma handling) —
 * good enough for a row-count / column-name estimate.
 * XLSX/XLS: NOT parsed client-side (would mean bundling a new dependency
 * just for a preview number) — these show "After upload" instead.
 *
 * "Est. Time" uses a rough, hardcoded assumed verification rate — always
 * labelled as an estimate in the UI, never presented as a real backend
 * figure (backend has no such estimate endpoint).
 */

// Rough UI-only assumption, NOT sourced from backend config. Loosely based
// on SMTP_MAX_WORKERS (20) running with some concurrency overhead.
const ASSUMED_EMAILS_PER_SECOND = 25;

function detectEmailColumnName(headerCells) {
  const exact = headerCells.find((c) => c.trim().toLowerCase() === 'email');
  if (exact) return exact.trim();
  const partial = headerCells.find((c) => /email|mail/i.test(c));
  if (partial) return partial.trim();
  return headerCells[0]?.trim() || 'email';
}

function formatEstimate(totalRows) {
  if (totalRows <= 0) return '—';
  const seconds = Math.max(1, Math.round(totalRows / ASSUMED_EMAILS_PER_SECOND));
  if (seconds < 60) return `~${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  return `~${minutes} min`;
}

/**
 * @param {File} file
 * @returns {Promise<{supported: boolean, totalRows: number|null, emailColumn: string|null, duplicates: number|null, estimate: string|null}>}
 */
export async function previewUploadFile(file) {
  const nameLower = (file.name || '').toLowerCase();
  const isCsvLike = nameLower.endsWith('.csv') || nameLower.endsWith('.txt');

  if (!isCsvLike) {
    // .xlsx / .xls — backend will detect everything correctly on upload.
    return {
      supported: false,
      totalRows: null,
      emailColumn: null,
      duplicates: null,
      estimate: null,
    };
  }

  let text;
  try {
    text = await file.text();
  } catch {
    return { supported: false, totalRows: null, emailColumn: null, duplicates: null, estimate: null };
  }

  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');

  if (lines.length === 0) {
    return { supported: true, totalRows: 0, emailColumn: null, duplicates: 0, estimate: '—' };
  }

  const header = lines[0].split(',');
  // Header row if it doesn't itself look like an email, or explicitly
  // contains an "email"/"mail" column name.
  const looksLikeHeader = header.some((c) => /email|mail/i.test(c)) || !header[0].includes('@');
  const emailColumn = detectEmailColumnName(header);
  const emailColIndex = looksLikeHeader
    ? header.findIndex((c) => c.trim().toLowerCase() === emailColumn.trim().toLowerCase())
    : 0;
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;
  const safeColIndex = emailColIndex >= 0 ? emailColIndex : 0;

  const seen = new Set();
  let duplicates = 0;
  for (const line of dataLines) {
    const cells = line.split(',');
    const raw = (cells[safeColIndex] ?? cells[0] ?? '').trim().toLowerCase();
    if (!raw) continue;
    if (seen.has(raw)) duplicates += 1;
    else seen.add(raw);
  }

  const totalRows = dataLines.length;

  return {
    supported: true,
    totalRows,
    emailColumn: looksLikeHeader ? emailColumn : 'email',
    duplicates,
    estimate: formatEstimate(totalRows),
  };
}
