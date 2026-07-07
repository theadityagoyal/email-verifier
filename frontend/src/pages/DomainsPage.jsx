import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
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
import { listDomains, getDomainOverview, getDashboardStats } from '@/services/api';
import Button from '@/components/ui/Button';

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
  // Tracks risk % moving up or down over the last 7 days — up is bad.
  up: { icon: TrendingUp, color: 'text-red-500' },
  down: { icon: TrendingDown, color: 'text-emerald-500' },
  stable: { icon: Minus, color: 'text-[var(--foreground)]/40' },
};

const SORT_OPTIONS = [
  { value: 'risk', label: 'Risk % (High to Low)' },
  { value: 'total', label: 'Total Emails (High to Low)' },
  { value: 'trust', label: 'Trust Score (High to Low)' },
  { value: 'domain', label: 'Domain (A–Z)' },
  { value: 'newest', label: 'Newest First' },
];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function pageWindow(page, pages) {
  // Compact page list: 1 ... p-1 p p+1 ... last
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const sorted = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const result = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push('…');
    result.push(p);
  });
  return result;
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
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('risk');
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState([]);
  const [openMenu, setOpenMenu] = useState(null);

  // Client-side refinements on top of the current page. The backend only
  // accepts { page, size, search, sort } — Risk/MX/Flags/Min Emails narrow
  // whatever page is currently loaded, same limitation the old search filter
  // had, so a wider net (bigger page size) may be needed to see everything.
  const [riskFilter, setRiskFilter] = useState('All');
  const [mxFilter, setMxFilter] = useState('All');
  const [flagsFilter, setFlagsFilter] = useState('All');
  const [minEmails, setMinEmails] = useState('');

  const { data: domainsData, isLoading, error, refetch } = useQuery({
    queryKey: ['domains', page, size, search, sort],
    queryFn: () => listDomains({ page, size, search: search || undefined, sort }),
    placeholderData: (previousData) => previousData,
  });

  const { data: overview } = useQuery({
    queryKey: ['domains-overview'],
    queryFn: getDomainOverview,
  });

  const { data: topRiskData } = useQuery({
    queryKey: ['domains-top-risk'],
    queryFn: () => listDomains({ page: 1, size: 5, sort: 'risk' }),
  });

  const { data: newestData } = useQuery({
    queryKey: ['domains-newest'],
    queryFn: () => listDomains({ page: 1, size: 20, sort: 'newest' }),
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

  // 7-day risk trend, derived from the same bucket_counts the dashboard
  // already exposes via /dashboard/stats — no separate endpoint needed.
  const dailyRiskTrend = useMemo(() => {
    const daily = trendStats?.daily_volume || [];
    return daily.map((d) => {
      const denom = d.safe + d.risky + d.unsafe;
      const riskPct = denom > 0 ? Math.round(((d.risky + d.unsafe) / denom) * 100 * 10) / 10 : 0;
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
    return daily.map((d) => ({ date: d.date, count: d.safe + d.risky + d.unsafe + d.processing }));
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
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-1">Domains</h1>
          <p className="text-[var(--foreground)]/60">Domain analytics and deliverability insights</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportFiltered}>
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="danger" disabled={selected.length === 0}>
            <Trash2 className="h-4 w-4" />
            Delete Selected ({selected.length})
          </Button>
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/20">
              <Globe className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-[var(--foreground)]/50">Total Domains</p>
              <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
                {(overview?.total_domains ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-[var(--foreground)]/50">Across all time</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/20">
              <Mail className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-sm text-[var(--foreground)]/50">Total Emails</p>
              <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
                {(overview?.total_emails ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm text-[var(--foreground)]/50">Across all domains</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-[var(--foreground)]/50">Safe</p>
              <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
                {(overview?.safe ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-emerald-600">{safePct}% of total</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/20">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-[var(--foreground)]/50">Risky + Unsafe</p>
              <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums">
                {riskyUnsafe.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-3 text-sm font-medium text-amber-600">{riskyUnsafePct}% of total</p>
        </div>

        <div className="card">
          <p className="text-sm font-semibold text-[var(--foreground)] mb-3">Flagged Domains</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 px-2 py-2">
              <Trash2 className="h-4 w-4 text-red-500 shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--foreground)]/50 leading-none">Disposable</p>
                <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                  {overview?.disposable_domains ?? 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 px-2 py-2">
              <Mail className="h-4 w-4 text-indigo-500 shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--foreground)]/50 leading-none">Catch-all</p>
                <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                  {overview?.catch_all_domains ?? 0}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 px-2 py-2">
              <Ban className="h-4 w-4 text-amber-500 shrink-0" />
              <div>
                <p className="text-[10px] text-[var(--foreground)]/50 leading-none">No MX</p>
                <p className="text-sm font-bold text-[var(--foreground)] tabular-nums">
                  {overview?.no_mx_domains ?? 0}
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Analytics section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-4"
      >
        {/* Top 5 Riskiest Domains */}
        <div className="card">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-4">Top 5 Riskiest Domains</h3>
          <div className="space-y-3">
            {topRiskDomains.length === 0 && (
              <p className="text-sm text-[var(--foreground)]/40">No data yet</p>
            )}
            {topRiskDomains.map((d) => (
              <div key={d.domain}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="truncate text-[var(--foreground)] font-medium">{d.domain}</span>
                  <span className="font-semibold text-red-500 tabular-nums">{d.risk_percent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${Math.min(d.risk_percent, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setSort('risk');
              setPage(1);
            }}
            className="mt-4 w-full text-center text-sm font-medium text-[var(--accent)] hover:underline"
          >
            View all
          </button>
        </div>

        {/* 7-Day Risk Trend */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">7-Day Risk Trend (All Domains)</h3>
            {overallTrendDelta !== null && (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  overallTrendDelta > 0
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                    : overallTrendDelta < 0
                    ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                    : 'bg-[var(--muted)] text-[var(--foreground)]/50'
                }`}
              >
                {overallTrendDelta > 0 ? <TrendingUp className="h-3 w-3" /> : overallTrendDelta < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {Math.abs(overallTrendDelta)}% vs last 7 days
              </span>
            )}
          </div>
          <div className="h-40 -ml-2">
            {dailyRiskTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyRiskTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="riskTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'var(--foreground)', opacity: 0.5 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Risk']}
                    contentStyle={{
                      background: 'var(--background)',
                      border: '1px solid var(--muted)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="riskPct" stroke="#ef4444" strokeWidth={2} fill="url(#riskTrendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-[var(--foreground)]/40 h-full flex items-center justify-center">No data yet</p>
            )}
          </div>
        </div>

        {/* New Domains */}
        <div className="card">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">New Domains (Last 7 Days)</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-[var(--foreground)] tabular-nums">
                {overview?.new_domains_count ?? 0}
              </p>
              <p className="text-sm text-indigo-600 font-medium">{newDomainsPct}% of total domains</p>
            </div>
            <div className="h-14 w-24">
              {newDomainsSparkline.length > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={newDomainsSparkline}>
                    <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => {
              setSort('newest');
              setPage(1);
            }}
          >
            View new domains
          </Button>
        </div>
      </motion.div>

      {/* Search & Filters */}
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
                setPage(1);
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

          <button
            onClick={clearFilters}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-[var(--foreground)]/50 hover:text-[var(--foreground)] transition-colors"
          >
            Clear
          </button>

          <div className="ml-auto">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="rounded-full border border-[var(--muted)] bg-[var(--background)] px-3 py-1.5 text-sm font-medium text-[var(--foreground)]"
              aria-label="Sort domains"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort by: {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </motion.div>

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
            <div className="overflow-x-auto">
              <table className="w-full" role="grid">
                <thead>
                  <tr className="border-b border-[var(--muted)] bg-[var(--muted)]/30">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.length === filteredDomains.length && filteredDomains.length > 0}
                        onChange={toggleSelectAll}
                        aria-label="Select all domains"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider min-w-[180px]">
                      Domain
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-24">
                      Total Emails
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-20">
                      Safe
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-20">
                      Risky
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-20">
                      Unsafe
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-32">
                      Risk %
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-24">
                      7D Trend
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-24">
                      MX Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-24">
                      Flags
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-28">
                      First Seen
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-40">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--muted)]">
                  {filteredDomains.map((domain, rowIndex) => {
                    const { icon: VerdictIcon, badge } = VERDICT_CONFIG[domain.verdict] || VERDICT_CONFIG.Healthy;
                    const { icon: TrendIcon, color: trendColor } = TREND_CONFIG[domain.trend] || TREND_CONFIG.stable;
                    const isRisky = domain.verdict === 'High Risk' || domain.verdict === 'Watch';
                    const isLowSample = domain.low_sample;

                    return (
                      <motion.tr
                        key={domain.domain}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: rowIndex * 0.02 }}
                        className="hover:bg-[var(--muted)]/30 transition-colors cursor-pointer"
                        onClick={() => {
                          window.location.href = `/emails?domain=${encodeURIComponent(domain.domain)}`;
                        }}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.includes(domain.domain)}
                            onChange={() => toggleSelectOne(domain.domain)}
                            aria-label={`Select ${domain.domain}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-medium text-[var(--foreground)]">
                            <Globe className="h-4 w-4 text-[var(--foreground)]/40 shrink-0" />
                            {domain.domain}
                            <ExternalLink
                              className="h-3 w-3 text-[var(--foreground)]/30 hover:text-[var(--accent)]"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://${domain.domain}`, '_blank');
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge}`}>
                              <VerdictIcon className="h-3 w-3" />
                              {domain.verdict}
                            </span>
                            {domain.is_new && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 px-2 py-0.5 text-[10px] font-semibold">
                                <Sparkles className="h-3 w-3" />
                                New
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-[var(--foreground)]">
                          {(domain.total_emails || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-success tabular-nums">
                            {(domain.safe_count || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-warning tabular-nums">
                            {(domain.risky_count || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-error tabular-nums">
                            {(domain.unsafe_count || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {isLowSample ? (
                            <div>
                              <span className="text-sm text-[var(--foreground)]/40">—</span>
                              <p className="text-[10px] text-[var(--foreground)]/40">Low volume</p>
                            </div>
                          ) : (
                            <div className="min-w-[90px]">
                              <span className="text-sm font-semibold tabular-nums text-[var(--foreground)]">
                                {(domain.risk_percent ?? 0).toFixed(1)}%
                              </span>
                              <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden mt-1">
                                <div
                                  className={`h-full rounded-full ${
                                    domain.risk_percent >= 30 ? 'bg-red-500' : domain.risk_percent >= 10 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${Math.min(domain.risk_percent ?? 0, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {domain.trend_delta_pct === null || domain.trend_delta_pct === undefined ? (
                            <span className="text-sm text-[var(--foreground)]/40">—</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${trendColor}`}>
                              <TrendIcon className="h-3.5 w-3.5" />
                              {domain.trend_delta_pct > 0 ? '+' : ''}
                              {domain.trend_delta_pct}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${MX_STATUS_COLOR[domain.mx_status] || ''}`}>
                            {domain.mx_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {domain.disposable_count > 0 && (
                              <span title="Disposable" className="p-1 rounded bg-red-100 dark:bg-red-900/20">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </span>
                            )}
                            {domain.catch_all_count > 0 && (
                              <span title="Catch All" className="p-1 rounded bg-indigo-100 dark:bg-indigo-900/20">
                                <Mail className="h-3.5 w-3.5 text-indigo-500" />
                              </span>
                            )}
                            {domain.role_based_count > 0 && (
                              <span title="Role Based" className="p-1 rounded bg-amber-100 dark:bg-amber-900/20">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              </span>
                            )}
                            {!domain.disposable_count && !domain.catch_all_count && !domain.role_based_count && (
                              <span className="text-xs text-[var(--foreground)]/40">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[var(--foreground)]/60">
                          {formatDate(domain.first_seen)}
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1 relative">
                            {isRisky ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-error border-error/40 hover:bg-error/10"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Block Domain
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  window.location.href = `/emails?domain=${encodeURIComponent(domain.domain)}`;
                                }}
                              >
                                <Mail className="h-3.5 w-3.5" />
                                View Emails
                              </Button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenu(openMenu === domain.domain ? null : domain.domain);
                              }}
                              className="p-1.5 rounded-lg text-[var(--foreground)]/50 hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                              aria-label={`More actions for ${domain.domain}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMenu === domain.domain && (
                              <div className="absolute right-0 top-8 z-10 w-40 rounded-lg border border-[var(--muted)] bg-[var(--background)] shadow-lg py-1">
                                <button
                                  onClick={() => {
                                    window.location.href = `/emails?domain=${encodeURIComponent(domain.domain)}`;
                                  }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/40"
                                >
                                  <Mail className="h-3.5 w-3.5" />
                                  View Emails
                                </button>
                                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/40">
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Reverify
                                </button>
                                <button
                                  onClick={() => window.open(`https://${domain.domain}`, '_blank')}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/40"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Website
                                </button>
                                <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error hover:bg-error/10">
                                  <Ban className="h-3.5 w-3.5" />
                                  Block Domain
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t border-[var(--muted)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-[var(--foreground)]/50">
                <span>{selected.length} of {filteredDomains.length} selected</span>
                <span className="hidden sm:inline">
                  · {(page - 1) * size + 1}–{(page - 1) * size + domains.length} of {total} domains
                </span>
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-[var(--muted)] bg-[var(--background)] px-2 py-1 text-sm"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
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
                      onClick={() => setPage(p)}
                      className={`h-8 w-8 rounded-lg text-sm font-medium ${
                        p === page
                          ? 'bg-[var(--primary)] text-white'
                          : 'text-[var(--foreground)]/70 hover:bg-[var(--muted)]/40'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
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
