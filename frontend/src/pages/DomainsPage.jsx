import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { listDomains, getDomainOverview, getDashboardStats } from '@/services/api';
import Button from '@/components/ui/Button';

// Import our new components
import DomainHeader from '@/components/pages/DomainHeader';
import DomainStats from '@/components/pages/DomainStats';
import DomainAnalytics from '@/components/pages/DomainAnalytics';
import DomainFilters from '@/components/pages/DomainFilters';
import DomainTable from '@/components/pages/DomainTable';
import DomainPagination from '@/components/pages/DomainPagination';

import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  ExternalLink,
  Globe,
  Mail,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Ban,
  RefreshCw,
  Sparkles,
  MoreVertical,
  Info,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const VERDICT_CONFIG = {
  Healthy: {
    icon: ShieldCheck,
    badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
  },
  Watch: {
    icon: ShieldAlert,
    badge: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
  },
  'High Risk': {
    icon: ShieldX,
    badge: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
  },
  'Low Sample': {
    icon: AlertTriangle,
    badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
  },
};

const MX_STATUS_COLOR = {
  Valid: 'text-emerald-600',
  'No MX': 'text-red-600',
  Unknown: 'text-[var(--foreground)]/40',
};

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: 'text-red-500' },
  down: { icon: TrendingDown, color: 'text-emerald-500' },
  stable: { icon: Minus, color: 'text-[var(--foreground)]/40' },
};

// Kept for the legacy DomainHeader dropdown, if it's still wired up. New
// per-column header sorting (SortHeader inside DomainTable) is the primary
// UI now — this dropdown just maps onto the same sortBy/sortOrder state.
const SORT_OPTIONS = [
  { value: 'risk', label: 'Risk % (High to Low)' },
  { value: 'total', label: 'Total Emails (High to Low)' },
  { value: 'trust', label: 'Trust Score (High to Low)' },
  { value: 'domain', label: 'Domain (A–Z)' },
  { value: 'newest', label: 'Newest First' },
];

// ── Server-side sort contract (must match backend SORTABLE_DOMAIN_FIELDS) ──
const SORTABLE_FIELDS = new Set([
  'domain', 'total_emails', 'safe', 'risky', 'unsafe',
  'risk_percent', 'trend', 'mx_status', 'first_seen',
]);
const DEFAULT_SORT_BY = 'first_seen';
const DEFAULT_SORT_ORDER = 'desc';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function downloadCsv(rows, filename) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DomainsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [size, setSize] = useState(20);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');

  // ── Sort state, seeded from the URL so refresh/deep-link keeps the sort ──
  const [sortBy, setSortBy] = useState(() => {
    const fromUrl = searchParams.get('sort_by');
    return fromUrl && SORTABLE_FIELDS.has(fromUrl) ? fromUrl : DEFAULT_SORT_BY;
  });
  const [sortOrder, setSortOrder] = useState(() => {
    const fromUrl = searchParams.get('sort_order');
    return fromUrl === 'asc' || fromUrl === 'desc' ? fromUrl : DEFAULT_SORT_ORDER;
  });

  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState([]);
  const [openMenu, setOpenMenu] = useState(null);

  // Client-side refinements on top of the current page. The backend only
  // accepts { page, size, search, sort_by, sort_order } — Risk/MX/Flags/Min
  // Emails narrow whatever page is currently loaded, same limitation the
  // old search filter had, so a wider net (bigger page size) may be needed
  // to see everything. (Pre-existing limitation — not changed here; moving
  // these to server-side filters is a good follow-up.)
  const [riskFilter, setRiskFilter] = useState('All');
  const [mxFilter, setMxFilter] = useState('All');
  const [flagsFilter, setFlagsFilter] = useState('All');
  const [minEmails, setMinEmails] = useState('');

  // --- BUG A FIX -----------------------------------------------------------
  // search/sort changes must reset to page 1, otherwise a stale `page` can
  // point past the end of the new, smaller/differently-ordered result set.
  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  // ── Per-column sort click handler (3-state cycle) ────────────────────────
  // nextOrder is 'asc' | 'desc' | null, as produced by SortHeader.
  // null ("no sort") reverts to the default sort rather than sending an
  // empty sort_by — the table should never be visually "unsorted".
  const handleSort = useCallback((field, nextOrder) => {
    if (nextOrder === null) {
      setSortBy(DEFAULT_SORT_BY);
      setSortOrder(DEFAULT_SORT_ORDER);
    } else {
      setSortBy(field);
      setSortOrder(nextOrder);
    }
    setPage(1);
  }, []);

  // Legacy dropdown (DomainHeader) support — maps its single `sort` value
  // onto the same sortBy/sortOrder state so both controls stay in sync
  // instead of fighting each other.
  const LEGACY_SORT_TO_FIELD = {
    risk: ['risk_percent', 'desc'],
    total: ['total_emails', 'desc'],
    trust: ['risk_percent', 'asc'],
    domain: ['domain', 'asc'],
    newest: ['first_seen', 'desc'],
  };
  const handleLegacySortChange = (value) => {
    const mapped = LEGACY_SORT_TO_FIELD[value];
    if (mapped) {
      setSortBy(mapped[0]);
      setSortOrder(mapped[1]);
      setPage(1);
    }
  };

  // --- BUG B FIX -------------------------------------------------------------
  // `selected` must not silently carry over across pages/search/sort — the
  // "select all" checkbox has no way to show "N selected across other pages",
  // so keeping stale selections around causes it to render as checked/mixed
  // for rows the user never actually picked on the new page.
  useEffect(() => {
    setSelected([]);
  }, [page, search, sortBy, sortOrder]);

  // ── Keep sort/search/page in the URL so a refresh preserves them ────────
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    if (search) next.set('search', search); else next.delete('search');
    next.set('sort_by', sortBy);
    next.set('sort_order', sortOrder);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sortBy, sortOrder]);

  const {
    data: domainsData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['domains', page, size, search, sortBy, sortOrder],
    queryFn: () =>
      listDomains({
        page,
        size,
        search: search || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    placeholderData: (previousData) => previousData,
  });

  // True only for a background refetch (sort/page/search change) with data
  // already on screen — not the very first load, which already has its own
  // full-page spinner below.
  const isSorting = isFetching && !isLoading;

  const { data: overview } = useQuery({
    queryKey: ['domains-overview'],
    queryFn: getDomainOverview,
  });

  const { data: topRiskData } = useQuery({
    queryKey: ['domains-top-risk'],
    queryFn: () => listDomains({ page: 1, size: 5, sort_by: 'risk_percent', sort_order: 'desc' }),
  });

  const { data: trendStats } = useQuery({
    queryKey: ['dashboard-stats', 7],
    queryFn: () => getDashboardStats(7),
  });

  const domains = domainsData?.items || [];
  const total = domainsData?.total || 0;
  const pages = domainsData?.pages || 1;
  const topRiskDomains = topRiskData?.items || [];

  const filteredDomains = useMemo(() => {
    return domains.filter((d) => {
      if (riskFilter !== 'All' && d.verdict !== riskFilter) return false;
      if (mxFilter !== 'All' && d.mx_status !== mxFilter) return false;
      if (flagsFilter === 'Disposable' && !d.disposable_count) return false;
      if (flagsFilter === 'Role Based' && !d.role_based_count) return false;
      if (flagsFilter === 'Catch All' && !d.catch_all_count) return false;
      if (minEmails && d.total_emails < Number(minEmails)) return false;
      return true;
    });
  }, [domains, riskFilter, mxFilter, flagsFilter, minEmails]);

  const toggleSelectAll = () => {
    setSelected((prev) =>
      prev.length === filteredDomains.length ? [] : filteredDomains.map((d) => d.domain)
    );
  };

  const toggleSelectOne = (domain) => {
    setSelected((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  };

  const clearFilters = () => {
    setRiskFilter('All');
    setMxFilter('All');
    setFlagsFilter('All');
    setMinEmails('');
  };

  // --- BUG D FIX -------------------------------------------------------------
  // Single source of truth for the 7-day risk trend + sparkline data.
  // Previously this exact calculation was duplicated inside DomainAnalytics
  // (with a typo bug that crashed the page). Now it's computed once here and
  // passed down as props, so there's only one place to fix if the logic
  // ever needs to change.
  const dailyRiskTrend = useMemo(() => {
    const daily = trendStats?.daily_volume || [];
    return daily
      .filter((d) => d?.date)
      .map((d) => {
        const safe = d.safe || 0;
        const risky = d.risky || 0;
        const unsafe = d.unsafe || 0;
        const denom = safe + risky + unsafe;
        const riskPct = denom > 0 ? Math.round(((risky + unsafe) / denom) * 100 * 10) / 10 : 0;
        return {
          date: d.date,
          label: new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          riskPct,
        };
      });
  }, [trendStats]);

  const overallTrendDelta = useMemo(() => {
    if (dailyRiskTrend.length < 2) return null;
    const first = dailyRiskTrend[0].riskPct;
    const last = dailyRiskTrend[dailyRiskTrend.length - 1].riskPct;
    return Math.round((last - first) * 10) / 10;
  }, [dailyRiskTrend]);

  const newDomainsSparkline = useMemo(() => {
    const daily = trendStats?.daily_volume || [];
    return daily
      .filter((d) => d?.date)
      .map((d) => ({
        date: d.date,
        count: (d.safe || 0) + (d.risky || 0) + (d.unsafe || 0) + (d.processing || 0),
      }));
  }, [trendStats]);

  const newDomainsPct =
    overview && overview.total_domains > 0
      ? Math.round((overview.new_domains_count / overview.total_domains) * 1000) / 10
      : 0;

  const safePct =
    overview && overview.safe + overview.risky + overview.unsafe > 0
      ? Math.round((overview.safe / (overview.safe + overview.risky + overview.unsafe)) * 1000) / 10
      : 0;

  const riskyUnsafe = overview ? overview.risky + overview.unsafe : 0;
  const riskyUnsafePct =
    overview && overview.safe + overview.risky + overview.unsafe > 0
      ? Math.round((riskyUnsafe / (overview.safe + overview.risky + overview.unsafe)) * 1000) / 10
      : 0;

  const exportFiltered = () => {
    downloadCsv(
      filteredDomains.map((d) => ({
        domain: d.domain,
        verdict: d.verdict,
        total_emails: d.total_emails,
        safe_count: d.safe_count,
        risky_count: d.risky_count,
        unsafe_count: d.unsafe_count,
        risk_percent: d.risk_percent,
        mx_status: d.mx_status,
        first_seen: d.first_seen,
      })),
      'domains-export.csv'
    );
  };

  return (
    <div className="space-y-6" onClick={() => openMenu && setOpenMenu(null)}>
      {/* Header */}
      <DomainHeader
        selected={selected}
        selectedLength={selected.length}
        onExport={exportFiltered}
        onDeleteSelected={() => {
          // Implement delete functionality if needed
        }}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        sort={sortBy === 'risk_percent' && sortOrder === 'desc' ? 'risk'
          : sortBy === 'total_emails' && sortOrder === 'desc' ? 'total'
          : sortBy === 'risk_percent' && sortOrder === 'asc' ? 'trust'
          : sortBy === 'domain' && sortOrder === 'asc' ? 'domain'
          : sortBy === 'first_seen' && sortOrder === 'desc' ? 'newest'
          : ''}
        setSort={handleLegacySortChange}
        SORT_OPTIONS={SORT_OPTIONS}
      />

      {/* Stat cards */}
      <DomainStats
        overview={overview}
        safePct={safePct}
        riskyUnsafePct={riskyUnsafePct}
      />

      {/* Analytics section */}
      <DomainAnalytics
        overview={overview}
        topRiskDomains={topRiskDomains}
        dailyRiskTrend={dailyRiskTrend}
        overallTrendDelta={overallTrendDelta}
        newDomainsSparkline={newDomainsSparkline}
        newDomainsPct={newDomainsPct}
        navigate={navigate}
      />

      {/* Search & Filters */}
      <DomainFilters
        search={search}
        setSearch={handleSearchChange}
        riskFilter={riskFilter}
        setRiskFilter={setRiskFilter}
        mxFilter={mxFilter}
        setMxFilter={setMxFilter}
        flagsFilter={flagsFilter}
        setFlagsFilter={setFlagsFilter}
        minEmails={minEmails}
        setMinEmails={setMinEmails}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        clearFilters={clearFilters}
      />

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="card overflow-hidden !p-0"
      >
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-[var(--foreground)]/60">Loading domains...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-error">
            <p>Failed to load domains: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-2">
              Retry
            </Button>
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="p-12 text-center">
            <Globe className="h-16 w-16 text-[var(--foreground)]/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No domains found</h3>
            <p className="text-[var(--foreground)]/50">
              {search ? 'Try adjusting your search' : 'Upload emails via Bulk Upload to populate domain analytics'}
            </p>
          </div>
        ) : (
          <>
            <DomainTable
              filteredDomains={filteredDomains}
              selected={selected}
              setSelected={setSelected}
              toggleSelectAll={toggleSelectAll}
              toggleSelectOne={toggleSelectOne}
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSort={handleSort}
              isSorting={isSorting}
            />

            <DomainPagination
              page={page}
              pages={pages}
              selectedLength={selected.length}
              filteredDomainsLength={filteredDomains.length}
              onPageChange={(newPage) => setPage(newPage)}
              onSizeChange={(newSize) => {
                setSize(newSize);
                setPage(1); // Reset to first page when size changes
              }}
              size={size}
              sizeOptions={[10, 20, 50, 100]}
            />
          </>
        )}
      </motion.div>

      {/* Info banner */}
      <div className="card !py-3 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-[var(--foreground)]/60">
          <Info className="h-4 w-4 text-[var(--accent)] shrink-0" />
          Click on any domain to view all emails from that domain in the Email List with filters applied.
        </div>
        <a href="#" className="text-[var(--accent)] font-medium hover:underline whitespace-nowrap">
          Learn more about domain insights
        </a>
      </div>
    </div>
  );
}
