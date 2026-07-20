import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { listDomains, getDomainOverview, getDashboardStats, bulkDeleteDomains, downloadDomainsExport } from '@/services/api';
import { reportError } from '@/utils/errorReporter';
import { formatChartLabelIST } from '@/utils/dateUtils';
import { useIsTabVisible } from '@/hooks/useIsTabVisible';

import DomainHeader from '@/components/pages/DomainHeader';
import DomainStats from '@/components/pages/DomainStats';
import DomainAnalytics from '@/components/pages/DomainAnalytics';
import DomainFilters from '@/components/pages/DomainFilters';
import DomainTable from '@/components/pages/DomainTable';
import DomainPagination from '@/components/pages/DomainPagination';

import { Info } from 'lucide-react';

// ── Server-side sort contract (must match backend SORTABLE_DOMAIN_FIELDS) ──
const SORTABLE_FIELDS = new Set([
  'domain', 'total_emails', 'safe', 'risky', 'unsafe',
  'risk_percent', 'trend', 'mx_status', 'first_seen',
]);
const DEFAULT_SORT_BY = 'first_seen';
const DEFAULT_SORT_ORDER = 'desc';

// FIX (project-wide live-update audit): none of the 4 queries on this page
// had a refetchInterval, so newly-verified emails changing a domain's
// counts/risk% (from an active bulk job, or another tab/user verifying)
// never showed up here without a manual page reload — inconsistent with
// DashboardPage, which already auto-refreshes every 10s. isTabVisible
// (shared hook, src/hooks/useIsTabVisible.js) pauses polling on background
// tabs so this doesn't hammer the backend for no reason.
const DOMAINS_REFETCH_INTERVAL_MS = 10000;

export default function DomainsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isTabVisible = useIsTabVisible();

  const [page, setPage] = useState(() => {
    const p = Number(searchParams.get('page'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [size, setSize] = useState(20);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');

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
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // FIX (audit #2): these now feed server-side query params (backend
  // /domains accepts risk_filter/mx_status/flags/min_emails and applies them
  // BEFORE pagination), instead of only ever filtering the current page's 20
  // already-fetched rows while pagination totals stayed unfiltered.
  const [riskFilter, setRiskFilter] = useState('All');
  const [mxFilter, setMxFilter] = useState('All');
  const [flagsFilter, setFlagsFilter] = useState('All');
  const [minEmails, setMinEmails] = useState('');

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

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

  // Any server-side filter change also resets to page 1 — otherwise a
  // narrower filtered result set could leave `page` pointing past the end.
  const handleRiskFilterChange = (v) => { setRiskFilter(v); setPage(1); };
  const handleMxFilterChange = (v) => { setMxFilter(v); setPage(1); };
  const handleFlagsFilterChange = (v) => { setFlagsFilter(v); setPage(1); };
  const handleMinEmailsChange = (v) => { setMinEmails(v); setPage(1); };

  useEffect(() => {
    setSelected([]);
  }, [page, search, sortBy, sortOrder, riskFilter, mxFilter, flagsFilter, minEmails]);

  // Push current state into the URL...
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    if (search) next.set('search', search); else next.delete('search');
    next.set('sort_by', sortBy);
    next.set('sort_order', sortOrder);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, sortBy, sortOrder]);

  // FIX (audit #13): ...and the reverse — when the URL changes from OUTSIDE
  // this component (browser Back/Forward), re-sync local state from it.
  // Previously page/search/sortBy/sortOrder were only ever seeded from the
  // URL once at mount time (useState(() => ...) initializers), so hitting
  // Back after sorting/filtering left the URL correct but the on-screen
  // table/controls stuck on the old state.
  useEffect(() => {
    const urlPage = Number(searchParams.get('page'));
    const urlSearch = searchParams.get('search') || '';
    const urlSortBy = searchParams.get('sort_by');
    const urlSortOrder = searchParams.get('sort_order');

    if (Number.isFinite(urlPage) && urlPage > 0 && urlPage !== page) setPage(urlPage);
    if (urlSearch !== search) setSearch(urlSearch);
    if (urlSortBy && SORTABLE_FIELDS.has(urlSortBy) && urlSortBy !== sortBy) setSortBy(urlSortBy);
    if ((urlSortOrder === 'asc' || urlSortOrder === 'desc') && urlSortOrder !== sortOrder) setSortOrder(urlSortOrder);
    // Only react to actual URL changes (popstate), not our own pushes above —
    // safe because both effects converge to the same values either way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Server-side filter params sent to /domains, shared between the paginated
  // list query and the full export so both always agree on "what matches".
  const serverFilterParams = useMemo(() => ({
    risk_filter: riskFilter !== 'All' ? riskFilter : undefined,
    mx_status: mxFilter !== 'All' ? mxFilter : undefined,
    flags: flagsFilter !== 'All' ? flagsFilter : undefined,
    min_emails: minEmails ? Number(minEmails) : undefined,
  }), [riskFilter, mxFilter, flagsFilter, minEmails]);

  const {
    data: domainsData,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['domains', page, size, search, sortBy, sortOrder, serverFilterParams],
    queryFn: () =>
      listDomains({
        page,
        size,
        search: search || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
        ...serverFilterParams,
      }),
    placeholderData: (previousData) => previousData,
    // FIX: main domains table now stays live — was manual-refresh-only.
    refetchInterval: isTabVisible ? DOMAINS_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const isSorting = isFetching && !isLoading;

  const { data: overview } = useQuery({
    queryKey: ['domains-overview'],
    queryFn: getDomainOverview,
    // FIX: top stat cards (Total Domains/Emails/Safe/Risky+Unsafe/Flagged)
    // now refresh with the rest of the page instead of freezing at
    // whatever they were on initial load.
    refetchInterval: isTabVisible ? DOMAINS_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const { data: topRiskData } = useQuery({
    queryKey: ['domains-top-risk'],
    queryFn: () => listDomains({ page: 1, size: 5, sort_by: 'risk_percent', sort_order: 'desc' }),
    // FIX: "Top 5 Riskiest Domains" card — same story, was static after
    // first load.
    refetchInterval: isTabVisible ? DOMAINS_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const { data: trendStats } = useQuery({
    queryKey: ['dashboard-stats', 7],
    queryFn: () => getDashboardStats(7),
    // FIX: powers the 7-Day Risk Trend chart + New Domains sparkline on
    // this page — was static after first load.
    refetchInterval: isTabVisible ? DOMAINS_REFETCH_INTERVAL_MS : false,
    refetchOnWindowFocus: true,
  });

  const domains = domainsData?.items || [];
  const total = domainsData?.total || 0;
  const pages = domainsData?.pages || 1;
  const topRiskDomains = topRiskData?.items || [];

  // Filtering is now server-side — `domains` already reflects every active
  // filter. No client-side re-filter needed here anymore.
  const filteredDomains = domains;

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
    setPage(1);
  };

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
          label: formatChartLabelIST(d.date),
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

  // FIX (audit #8): real full server-side export — respects the current
  // search + all active filters across the ENTIRE matching set, not just
  // whatever 20 rows were on the currently-loaded page.
  const exportFiltered = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await downloadDomainsExport({ search: search || undefined, ...serverFilterParams });
      toast.success('Export downloaded');
    } catch (err) {
      reportError('DomainsPage.export', err);
      toast.error(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  // FIX (audit #3): "Delete Selected" now actually deletes — previously
  // called an empty function with no backend support at all.
  const handleDeleteSelected = async () => {
    if (selected.length === 0 || isDeleting) return;
    if (!confirm(`Delete ${selected.length} domain(s)? This removes every email under ${selected.length === 1 ? 'this domain' : 'these domains'} too. This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      const result = await bulkDeleteDomains(selected);
      toast.success(`Deleted ${selected.length} domain(s) (${result.emails_deleted} emails removed)`);
      setSelected([]);
      refetch();
    } catch (err) {
      reportError('DomainsPage.bulkDelete', err);
      toast.error(err.message || 'Failed to delete domains');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6" onClick={() => openMenu && setOpenMenu(null)}>
      <DomainHeader
        selected={selected}
        selectedLength={selected.length}
        onExport={exportFiltered}
        isExporting={isExporting}
        onDeleteSelected={handleDeleteSelected}
        isDeleting={isDeleting}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
      />

      <DomainStats
        overview={overview}
        safePct={safePct}
        riskyUnsafePct={riskyUnsafePct}
      />

      <DomainAnalytics
        overview={overview}
        topRiskDomains={topRiskDomains}
        dailyRiskTrend={dailyRiskTrend}
        overallTrendDelta={overallTrendDelta}
        newDomainsSparkline={newDomainsSparkline}
        newDomainsPct={newDomainsPct}
        navigate={navigate}
      />

      <DomainFilters
        search={search}
        setSearch={handleSearchChange}
        riskFilter={riskFilter}
        setRiskFilter={handleRiskFilterChange}
        mxFilter={mxFilter}
        setMxFilter={handleMxFilterChange}
        flagsFilter={flagsFilter}
        setFlagsFilter={handleFlagsFilterChange}
        minEmails={minEmails}
        setMinEmails={handleMinEmailsChange}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        clearFilters={clearFilters}
      />

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
            <button onClick={() => refetch()} className="mt-2 underline">Retry</button>
          </div>
        ) : filteredDomains.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-[var(--foreground)]/50">
              {search || riskFilter !== 'All' || mxFilter !== 'All' || flagsFilter !== 'All' || minEmails
                ? 'No domains match your filters'
                : 'Upload emails via Bulk Upload to populate domain analytics'}
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
              navigate={navigate}
            />

            <DomainPagination
              page={page}
              pages={pages}
              selectedLength={selected.length}
              filteredDomainsLength={total}
              onPageChange={(newPage) => setPage(newPage)}
              onSizeChange={(newSize) => {
                setSize(newSize);
                setPage(1);
              }}
              size={size}
              sizeOptions={[10, 20, 50, 100]}
            />
          </>
        )}
      </motion.div>

      <div className="card !py-3 flex items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-2 text-[var(--foreground)]/60">
          <Info className="h-4 w-4 text-[var(--accent)] shrink-0" />
          Click on any domain to view all emails from that domain in the Email List with filters applied.
        </div>
      </div>
    </div>
  );
}
