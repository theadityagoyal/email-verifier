import { ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';

/**
 * Sortable <th>. Click cycles: ascending -> descending -> no sort (null).
 * Fully controlled — the parent owns { sortBy, sortOrder } and receives the
 * next state via onSort(field, nextOrder). nextOrder is one of
 * 'asc' | 'desc' | null (null = "clear sort", caller should fall back to
 * the default sort e.g. first_seen desc).
 *
 * Usage:
 *   <SortHeader
 *     label="Total Emails"
 *     field="total_emails"
 *     sortBy={sortBy}
 *     sortOrder={sortOrder}
 *     onSort={handleSort}
 *     align="left"        // or "right"
 *     className="w-24"    // any extra width/layout classes from the old <th>
 *   />
 */
export default function SortHeader({
  label,
  field,
  sortBy,
  sortOrder,
  onSort,
  align = 'left',
  className = '',
}) {
  const isActive = sortBy === field;

  // asc -> desc -> none -> asc ...
  const nextOrder = !isActive ? 'asc' : sortOrder === 'asc' ? 'desc' : null;

  const ariaSort = isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none';

  const handleActivate = () => onSort(field, nextOrder);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate();
    }
  };

  const Icon = isActive ? (sortOrder === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={`px-4 py-3 text-${align} text-xs font-semibold uppercase tracking-wider select-none ${className}`}
    >
      <button
        type="button"
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        title={`Sort by ${label}${isActive ? ` (currently ${sortOrder === 'asc' ? 'ascending' : 'descending'} — click to ${nextOrder ? nextOrder : 'clear'})` : ''}`}
        className={`group inline-flex items-center gap-1 rounded-md px-1 py-0.5 -mx-1 transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1
          ${isActive
            ? 'text-[var(--accent)]'
            : 'text-[var(--foreground)]/50 hover:text-[var(--foreground)]/80'}`}
      >
        {label}
        <Icon
          className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
            isActive ? 'opacity-100' : 'opacity-30 group-hover:opacity-70'
          }`}
        />
      </button>
    </th>
  );
}
