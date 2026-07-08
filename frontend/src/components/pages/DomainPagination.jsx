import { motion } from 'framer-motion';
import Button from '@/components/ui/Button';
import {
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export default function DomainPagination({
  page,
  pages,
  selectedLength,
  filteredDomainsLength,
  onPageChange,
  onSizeChange,
  size,
  sizeOptions = [10, 20, 50, 100],
}) {
  // Helper function to create page window (similar to original)
  const pageWindow = (currentPage, totalPages) => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const sorted = [...set].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) result.push('…');
      result.push(p);
    });
    return result;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="px-4 py-3 border-t border-[var(--muted)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
      <div className="flex items-center gap-3 text-sm text-[var(--foreground)]/50">
        <span>{selectedLength} of {filteredDomainsLength} selected</span>
        <span className="hidden sm:inline">
          · {((page - 1) * size + 1)}–{Math.min(page * size, filteredDomainsLength)} of {filteredDomainsLength} domains
        </span>
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={size}
            onChange={(e) => {
              onSizeChange(Number(e.target.value));
            }}
            className="rounded-lg border border-[var(--muted)] bg-[var(--background)] px-2 py-1 text-sm"
          >
            {sizeOptions.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {pageWindow(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-2 text-sm text-[var(--foreground)]/40">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`h-8 w-8 rounded-lg text-sm font-medium ${p === page
                ? 'bg-[var(--primary)] text-white'
                : 'text-[var(--foreground)]/70 hover:bg-[var(--muted)]/40'
              }`}
            >
              {p}
            </button>
          )
        )}
        <Button variant="outline" size="sm" onClick={() => onPageChange(Math.min(pages, page + 1))} disabled={page >= pages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}