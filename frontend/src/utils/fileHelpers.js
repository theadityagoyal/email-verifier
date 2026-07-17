// Small, shared formatting helpers for file previews (UploadZone) and
// upload-history cards (JobCard) — pure presentation, no business logic.

export function getFileExt(filename) {
  if (!filename || !filename.includes('.')) return 'FILE';
  return filename.split('.').pop().toUpperCase();
}

export function formatFileSize(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

// Literal Tailwind class strings (safe for production purge — same pattern
// already used in StatusBadge.jsx / scoreThresholds.js elsewhere in the app).
const EXT_COLOR = {
  CSV: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  XLSX: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
  XLS: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
};

export function getFileExtBadgeClass(ext) {
  return EXT_COLOR[ext] || 'bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-400';
}
