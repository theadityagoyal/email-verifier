import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Download, ChevronDown, Layers, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import Button from '@/components/ui/Button';
import { exportJobResults } from '@/services/api';

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Results', icon: Layers, iconColor: 'text-[var(--foreground)]/50' },
  { key: 'safe', label: 'Safe Only', icon: ShieldCheck, iconColor: 'text-success' },
  { key: 'risky', label: 'Risky Only', icon: ShieldAlert, iconColor: 'text-warning' },
  { key: 'unsafe', label: 'Unsafe Only', icon: ShieldX, iconColor: 'text-error' },
];

const MENU_WIDTH = 192; // matches w-48

/**
 * Dropdown for downloading a completed bulk job's results, filtered by
 * bucket (all/safe/risky/unsafe).
 *
 * FIX: previously rendered as a plain `position: absolute` child of
 * JobCard, whose outer wrapper has `overflow-hidden` (for the card's
 * rounded corners) — the dropdown's lower portion was getting silently
 * clipped by the card's own boundary. Now rendered via a React portal
 * straight into document.body with `position: fixed` coordinates computed
 * from the trigger button's real screen position, so it always paints on
 * top of everything regardless of any ancestor's overflow/clipping.
 */
export default function JobDownloadMenu({ jobId, block = false }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const left = block
      ? rect.left
      : Math.max(8, rect.right - MENU_WIDTH); // right-align to trigger, never off-screen left
    setCoords({
      top: rect.bottom + 6,
      left,
    });
  }, [block]);

  const toggleOpen = () => {
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
      {block ? (
        <button
          ref={triggerRef}
          type="button"
          onClick={toggleOpen}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg hover:bg-[var(--primary)]/20 transition-colors text-sm font-medium"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <Download className="h-4 w-4" />
          Download Results
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <div ref={triggerRef} className="inline-block">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleOpen}
            aria-haspopup="true"
            aria-expanded={open}
          >
            <Download className="h-3.5 w-3.5" />
            Download
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      )}

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setOpen(false)} />
            <div
              onClick={(e) => e.stopPropagation()}
              className="fixed z-[101] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1.5"
              style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
            >
              {FILTER_OPTIONS.map(({ key, label, icon: Icon, iconColor }) => (
                <a
                  key={key}
                  href={exportJobResults(jobId, key)}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3.5 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--card-hover)] transition-colors"
                >
                  <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                  {label}
                </a>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
}