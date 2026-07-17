import { Search, Filter, Trash2, ArrowUpDown } from 'lucide-react';

const DATE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'month', label: 'This Month' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All Statuses' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'completed', label: 'Completed' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const SORT_OPTIONS = [
  { key: 'status', label: 'Active first' },
  { key: 'newest', label: 'Newest first' },
  { key: 'oldest', label: 'Oldest first' },
];

export default function HistoryToolbar({
  search,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortChange,
  onClearAll,
  hasJobs,
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {DATE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onDateFilterChange(key)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              dateFilter === key
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--muted)]/40 text-[var(--foreground)]/60 hover:bg-[var(--muted)]/60'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground)]/40" aria-hidden="true" />
          <label htmlFor="bulk-history-search" className="sr-only">Search by file name or Job ID</label>
          <input
            id="bulk-history-search"
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by file name or Job ID..."
            className="input pl-10 w-full"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground)]/40 pointer-events-none" aria-hidden="true" />
          <label htmlFor="bulk-status-filter" className="sr-only">Filter by status</label>
          <select
            id="bulk-status-filter"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="input pl-9 pr-8 py-2 text-sm w-auto"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="relative">
          <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--foreground)]/40 pointer-events-none" aria-hidden="true" />
          <label htmlFor="bulk-sort" className="sr-only">Sort uploads</label>
          <select
            id="bulk-sort"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="input pl-9 pr-8 py-2 text-sm w-auto"
          >
            {SORT_OPTIONS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>

        {hasJobs && (
          <button
            onClick={onClearAll}
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-xl border border-error/30 text-error hover:bg-error/10 transition-colors whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}
