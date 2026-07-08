import { motion } from 'framer-motion';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

export default function DomainFilters({
  search,
  setSearch,
  riskFilter,
  setRiskFilter,
  mxFilter,
  setMxFilter,
  flagsFilter,
  setFlagsFilter,
  minEmails,
  setMinEmails,
  showFilters,
  setShowFilters,
  clearFilters,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="card overflow-hidden !p-0"
    >
      <div className="p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground)]/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // setPage(1); // This would be handled by parent
            }}
            placeholder="Search domains, MX records..."
            className="input pl-10 w-full"
            aria-label="Search domains"
          />
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-1.5 rounded-full border border-[var(--muted)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)]/70 hover:bg-[var(--muted)]/40 transition-colors"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <select
          value={riskFilter}
          onChange={(e) => setRiskFilter(e.target.value)}
          className="rounded-full border border-[var(--muted)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]/70"
        >
          <option value="All">Risk Level: All</option>
          <option value="Healthy">Healthy</option>
          <option value="Watch">Watch</option>
          <option value="High Risk">High Risk</option>
          <option value="Low Sample">Low Sample</option>
        </select>

        <select
          value={flagsFilter}
          onChange={(e) => setFlagsFilter(e.target.value)}
          className="rounded-full border border-[var(--muted)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]/70"
        >
          <option value="All">Has Flags: All</option>
          <option value="Disposable">Disposable</option>
          <option value="Role Based">Role Based</option>
          <option value="Catch All">Catch All</option>
        </select>

        <select
          value={mxFilter}
          onChange={(e) => setMxFilter(e.target.value)}
          className="rounded-full border border-[var(--muted)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]/70"
        >
          <option value="All">MX Status: All</option>
          <option value="Valid">Valid</option>
          <option value="No MX">No MX</option>
          <option value="Unknown">Unknown</option>
        </select>

        <input
          type="number"
          min="0"
          value={minEmails}
          onChange={(e) => setMinEmails(e.target.value)}
          placeholder="Min Emails"
          className="w-32 rounded-full border border-[var(--muted)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]/70"
        />

        <div className="ml-auto">
          <button
            onClick={clearFilters}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--foreground)]/50 hover:text-[var(--foreground)] transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    </motion.div>
  );
}