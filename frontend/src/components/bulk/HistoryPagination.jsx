import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function HistoryPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  sizeOptions = [10, 20, 50],
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const pageWindow = () => {
    if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
    const set = new Set([1, pages, page - 1, page, page + 1]);
    const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
    const result = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - sorted[i - 1] > 1) result.push('…');
      result.push(p);
    });
    return result;
  };

  if (total === 0) return null;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-center gap-3 text-sm text-[var(--foreground)]/50">
        <span>
          Showing {startItem} to {endItem} of {total} results
        </span>
        <div className="hidden sm:flex items-center gap-2">
          <label htmlFor="bulk-page-size" className="sr-only">Results per page</label>
          <span>Per page:</span>
          <select
            id="bulk-page-size"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-lg border border-[var(--muted)] bg-[var(--background)] px-2 py-1 text-sm"
          >
            {sizeOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--foreground)]/60 hover:bg-[var(--muted)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pageWindow().map((p, i) =>
          p === '…' ? (
            <span key={`e-${i}`} className="px-2 text-sm text-[var(--foreground)]/40">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`h-8 w-8 rounded-lg text-sm font-medium ${
                p === page ? 'bg-[var(--primary)] text-white' : 'text-[var(--foreground)]/70 hover:bg-[var(--muted)]/40'
              }`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-[var(--foreground)]/60 hover:bg-[var(--muted)]/40 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
