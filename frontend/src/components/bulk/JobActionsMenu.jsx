import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Copy, Trash2 } from 'lucide-react';

const MENU_WIDTH = 176; // matches w-44

/**
 * FIX: same clipping bug as JobDownloadMenu — this dropdown was
 * `position: absolute` inside JobCard, whose outer wrapper has
 * `overflow-hidden` for its rounded corners, so the menu's lower portion
 * was getting silently clipped. Now portaled to document.body with fixed
 * coordinates from the trigger button's real screen position.
 */
export default function JobActionsMenu({ jobId, onCopyId, onDelete }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - MENU_WIDTH),
    });
  }, []);

  const toggleOpen = (e) => {
    e.stopPropagation();
    if (!open) updatePosition();
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const handleReposition = () => updatePosition();
    window.addEventListener('keydown', handleKey);
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open, updatePosition]);

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        aria-label="More actions"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[101] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1.5"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
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
          </>,
          document.body
        )}
    </div>
  );
}