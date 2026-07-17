import { useState, useEffect } from 'react';
import { MoreVertical, Copy, Trash2 } from 'lucide-react';

export default function JobActionsMenu({ jobId, onCopyId, onDelete }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-9 z-50 w-44 rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => { onCopyId(jobId); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--card-hover)] transition-colors"
            >
              <Copy className="h-3.5 w-3.5" /> Copy Job ID
            </button>
            <button
              onClick={() => { onDelete(jobId); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-error hover:bg-error/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Upload
            </button>
          </div>
        </>
      )}
    </div>
  );
}
