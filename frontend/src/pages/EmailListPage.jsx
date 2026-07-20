import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Search, Filter, ChevronDown, ChevronUp, Download,
  Check, Trash2, Mail, ExternalLink, ShieldCheck, AlertTriangle, XCircle,
  ArrowUpDown, ArrowUp, ArrowDown, Globe, Shield, AlertCircle, Info, Calendar,
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import { listEmails, downloadEmailsExport, deleteEmail, getDashboardStats } from '@/services/api';
import { getPageWindow } from '@/utils/pagination';
import SortHeader from '@/components/pages/SortHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import Button from '@/components/ui/Button';
import { scoreColorClass } from '@/utils/scoreThresholds';
import { formatDateTimeIST } from '@/utils/dateUtils';
import { reportError } from '@/utils/errorReporter';

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'safe', label: 'Safe' },
  { value: 'risky', label: 'Risky' },
  { value: 'unsafe', label: 'Unsafe' },
  { value: 'processing', label: 'Processing' },
];

const scoreRangeOptions = [
  { value: '', label: 'All Scores' },
  { value: '76-100', label: '76+' },
  { value: '46-75', label: '46 - 75' },
  { value: '0-45', label: 'Below 46' },
];

const flaggedOptions = [
  { value: '', label: 'All Emails' },
  { value: 'any', label: 'Any Flagged' },
  { value: 'disposable', label: 'Disposable Only' },
  { value: 'role_based', label: 'Role Based Only' },
  { value: 'catch_all', label: 'Catch All Only' },
];

// FIX (audit #7): fields the backend actually accepts sort_by for now
// (SORTABLE_EMAIL_FIELDS in dashboard.py). Kept as a whitelist here too so
// clicking a non-sortable header is simply a no-op instead of silently
// sending a param the backend ignores.
const SORTABLE_FIELDS = new Set(['email', 'domain', 'status', 'score', 'verified_at', 'created_at']);

const CHECK_DEFS = [
  { key: 'syntax_valid', icon: Check, tone: 'positive', label: 'Syntax' },
  { key: 'domain_exists', icon: Globe, tone: 'positive', label: 'Domain' },
  { key: 'mx_found', icon: Mail, tone: 'positive', label: 'MX' },
  { key: 'smtp_valid', icon: Shield, tone: 'positive', label: 'SMTP' },
  { key: 'disposable', icon: AlertTriangle, tone: 'warning', label: 'Disposable' },
  { key: 'role_based', icon: Info, tone: 'info', label: 'Role' },
  { key: 'catch_all', icon: AlertCircle, tone: 'warning', label: 'Catch-all' },
];

const CHECK_TONE_COLORS = {
  positive: 'text-emerald-600',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

function ChecksCell({ email }) {
  return (
    <div className="flex items-center gap-1.5">
      {CHECK_DEFS.map(({ key, icon: Icon, tone, label }) =>
        email[key] ? (
          <Icon key={key} title={label} className={`h-4 w-4 ${CHECK_TONE_COLORS[tone]}`} />
        ) : null
      )}
    </div>
  );
}

function KpiCard({ icon: Icon, iconBg, iconColor, label, value, subtitle, subtitleColor }) {
  return (
    <div className="card flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
        <Icon className={`h-7 w-7 ${iconColor}`} />
      </div>
      <div>
        <p className="text-sm text-[var(--foreground)]/60">{label}</p>
        <p className="text-2xl font-bold text-[var(--foreground)]">{value.toLocaleString()}</p>
        <p className={`text-xs font-medium ${subtitleColor}`}>{subtitle}</p>
      </div>
    </div>
  );
}


export default function EmailListPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [size, setSize] = useState(20);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState(
    searchParams.get('domain') || ''
  );
  const [scoreRange, setScoreRange] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flaggedFilter, setFlaggedFilter] = useState(
    searchParams.get('filter') === 'flagged' ? 'any' : ''
  );
  // FIX (audit #7): sort is now real server state, sent as sort_by/sort_order
  // to /emails, instead of a client-side re-sort of whatever 20 rows the
  // current page happened to return.
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedEmails, setSelectedEmails] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // FIX (audit #14): react to the ?domain= param changing while already
  // mounted on this route (e.g. clicking "View Emails" for a different
  // domain from DomainTable while already on /emails — React Router won't
  // remount the page, so the old useState(() => ...) initializer never ran
  // again).
  useEffect(() => {
    const urlDomain = searchParams.get('domain') || '';
    if (urlDomain !== domainFilter) {
      setDomainFilter(urlDomain);
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('domain')]);

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', 7],
    queryFn: () => getDashboardStats(7),
  });

  const [scoreMin, scoreMax] =
    scoreRange ? scoreRange.split('-').map(Number) : [undefined, undefined];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      'emails',
      page,
      size,
      search,
      statusFilter,
      domainFilter,
      scoreRange,
      dateFrom,
      dateTo,
      flaggedFilter,
      sortBy,
      sortOrder,
    ],
    queryFn: () =>
      listEmails({
        page,
        size,
        search: search || undefined,
        status: statusFilter || undefined,
        domain: domainFilter || undefined,
        score_min: scoreMin,
        score_max: scoreMax,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        flagged: flaggedFilter || undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      }),
    placeholderData: (previousData) => previousData,
  });

  const emails = data?.items || [];
  const selectAll =
    emails.length > 0 &&
    emails.every((email) => selectedEmails.has(email.email));
  const total = data?.total || 0;
  const totalPages = data?.pages || 1;

  const totalEmails = stats?.total_emails || 0;
  const safeCount = stats?.bucket_counts?.safe || 0;
  const riskyCount = stats?.bucket_counts?.risky || 0;
  const unsafeCount = stats?.bucket_counts?.unsafe || 0;
  const pct = (n) => (totalEmails > 0 ? ((n / totalEmails) * 100).toFixed(1) : '0.0');

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedEmails(new Set());
    } else {
      setSelectedEmails(new Set(emails.map((e) => e.email)));
    }
  };

  const handleSelectEmail = (email) => {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) {
        next.delete(email);
      } else {
        next.add(email);
      }
      return next;
    });
  };

  // FIX (audit #12): added isDeleting state — button now disables + shows a
  // spinner while the batch of deletes is in flight, so double-clicking
  // can't fire duplicate delete batches for large selections.
  const handleBulkDelete = async () => {
    if (selectedEmails.size === 0 || isDeleting) return;

    if (!confirm(`Delete ${selectedEmails.size} email(s)?`)) return;

    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        [...selectedEmails].map((email) => deleteEmail(email))
      );

      const failed = results.filter(r => r.status === 'rejected').length;

      if (failed) {
        toast.error(`${failed} email(s) failed to delete.`);
      } else {
        toast.success(`${selectedEmails.size} email(s) deleted.`);
      }

      setSelectedEmails(new Set());
      refetch();
    } catch (err) {
      reportError('EmailListPage.bulkDelete', err);
      toast.error('Bulk delete failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  // FIX (audit #31): fetch+blob download with real error feedback, instead
  // of a bare window.open() on a GET URL that silently opens a blank tab if
  // the server returns a 500.
  const handleBulkExport = async () => {
    if (isExporting) return;
    const filters = {};

    if (search) filters.search = search;
    if (statusFilter) filters.status = statusFilter;
    if (domainFilter) filters.domain = domainFilter;
    if (scoreMin !== undefined) filters.score_min = scoreMin;
    if (scoreMax !== undefined) filters.score_max = scoreMax;
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    if (flaggedFilter) filters.flagged = flaggedFilter;

    setIsExporting(true);
    try {
      await downloadEmailsExport(filters);
      toast.success('Export downloaded');
    } catch (err) {
      reportError('EmailListPage.export', err);
      toast.error(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearFilters = () => {
    setStatusFilter('');
    setDomainFilter('');
    setScoreRange('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setSearchInput('');
    setFlaggedFilter('');
    setSearchParams({});
    setSelectedEmails(new Set());
    setPage(1);
  };

  // FIX (audit #7): now updates real sort state that feeds the query,
  // instead of re-sorting only the currently-loaded page client-side.
  const handleSort = (field, nextOrder) => {
    if (!SORTABLE_FIELDS.has(field)) return;
    setSortBy(field);
    setSortOrder(nextOrder);
    setPage(1);
  };

  const columns = [
    { key: 'select', label: '', width: 'w-12', sortable: false },
    { key: 'email', label: 'Email', width: 'min-w-[240px]', sortable: true },
    { key: 'domain', label: 'Domain', width: 'min-w-[140px]', sortable: true },
    { key: 'status', label: 'Overall Status', width: 'w-36', sortable: true },
    { key: 'score', label: 'Score', width: 'w-24', sortable: true },
    { key: 'checks', label: 'Checks', width: 'w-36', sortable: false },
    { key: 'verified_at', label: 'Verified', width: 'w-36', sortable: true },
    { key: 'actions', label: 'Actions', width: 'w-24', sortable: false },
  ];

  return (
    <div className="space-y-6">

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-1">Email List</h1>
          <p className="text-sm text-[var(--foreground)]/60">
            {flaggedFilter
              ? 'Showing flagged emails requiring manual review'
              : 'Manage and filter verified emails'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleBulkExport} disabled={total === 0 || isExporting} loading={isExporting}>
            <Download className="h-4 w-4" />
            Export Filtered
          </Button>
          <Button
            variant="ghost"
            onClick={handleBulkDelete}
            disabled={selectedEmails.size === 0 || isDeleting}
            loading={isDeleting}
            className="text-error hover:text-error"
          >
            {!isDeleting && <Trash2 className="h-4 w-4" />}
            Delete Selected ({selectedEmails.size})
          </Button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <KpiCard
          icon={ShieldCheck}
          iconBg="bg-emerald-100 dark:bg-emerald-900/20"
          iconColor="text-emerald-600"
          label="Safe Emails"
          value={safeCount}
          subtitle={`${pct(safeCount)}% of total`}
          subtitleColor="text-emerald-600"
        />
        <KpiCard
          icon={AlertTriangle}
          iconBg="bg-amber-100 dark:bg-amber-900/20"
          iconColor="text-amber-600"
          label="Risky Emails"
          value={riskyCount}
          subtitle={`${pct(riskyCount)}% of total`}
          subtitleColor="text-amber-600"
        />
        <KpiCard
          icon={XCircle}
          iconBg="bg-red-100 dark:bg-red-900/20"
          iconColor="text-red-600"
          label="Unsafe Emails"
          value={unsafeCount}
          subtitle={`${pct(unsafeCount)}% of total`}
          subtitleColor="text-red-600"
        />
        <KpiCard
          icon={Mail}
          iconBg="bg-[var(--accent)]/10"
          iconColor="text-[var(--accent)]"
          label="Total Emails"
          value={totalEmails}
          subtitle="All verified emails"
          subtitleColor="text-[var(--foreground)]/50"
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="card overflow-hidden"
      >
        <div className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--foreground)]/40" />
              {/* FIX (audit #30): label now programmatically linked via
                  htmlFor/id — was visually implied only. */}
              <label htmlFor="email-search-input" className="sr-only">Search emails or domains</label>
              <input
                id="email-search-input"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search emails, domains..."
                className="input pl-10"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]' : ''}
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {showFilters ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
            </Button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
            >
              <div>
                <label htmlFor="status-filter" className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">Overall Status</label>
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="input w-full"
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="domain-filter" className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">Domain</label>
                <input
                  id="domain-filter"
                  type="text"
                  value={domainFilter}
                  onChange={(e) => { setDomainFilter(e.target.value); setPage(1); }}
                  placeholder="All Domains"
                  className="input w-full"
                />
              </div>

              <div>
                <label htmlFor="score-range-filter" className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">Score Range</label>
                <select
                  id="score-range-filter"
                  value={scoreRange}
                  onChange={(e) => { setScoreRange(e.target.value); setPage(1); }}
                  className="input w-full"
                >
                  {scoreRangeOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="flagged-filter" className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">Flagged</label>
                <select
                  id="flagged-filter"
                  value={flaggedFilter}
                  onChange={(e) => {
                    setFlaggedFilter(e.target.value);
                    setPage(1);
                    setSearchParams(e.target.value ? { filter: 'flagged' } : {});
                  }}
                  className="input w-full"
                >
                  {flaggedOptions.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="date-from-filter" className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">From Date</label>
                <div className="relative flex items-center gap-2">
                  <Calendar className="absolute left-3 h-4 w-4 text-[var(--foreground)]/40 pointer-events-none" />
                  <input
                    id="date-from-filter"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                    className="input pl-9 w-full"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="date-to-filter" className="block text-xs font-medium text-[var(--foreground)]/50 mb-1">To Date</label>
                <div className="relative flex items-center gap-2">
                  <Calendar className="absolute left-3 h-4 w-4 text-[var(--foreground)]/40 pointer-events-none" />
                  <input
                    id="date-to-filter"
                    type="date"
                    value={dateTo}
                    onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                    className="input pl-9 w-full"
                  />
                </div>
              </div>

              {/* FIX (audit #22): removed the "Apply Filters" button — every
                  filter above already updates state on change and triggers
                  an instant react-query refetch (live filtering). The button
                  was a no-op that implied filters were staged/pending when
                  they were already live, which was actively misleading. */}
              <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.15 }}
        className="card overflow-hidden p-0"
      >
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-3 border-[var(--accent)] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-[var(--foreground)]/60">Loading emails...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-error">
            <p>Failed to load emails: {error.message}</p>
            <Button variant="outline" onClick={() => refetch()} className="mt-2">
              Retry
            </Button>
          </div>
        ) : emails.length === 0 ? (
          <div className="p-12 text-center">
            <Mail className="h-16 w-16 text-[var(--foreground)]/20 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No emails found</h3>
            <p className="text-[var(--foreground)]/60">
              {search || statusFilter || domainFilter || flaggedFilter
                ? 'Try adjusting your filters'
                : 'Upload emails via Bulk Upload to get started'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full" role="grid">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-[var(--muted)] bg-[var(--muted)]/40">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3.5 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider ${col.width}`}
                        style={{ minWidth: col.width }}
                        scope="col"
                      >
                        {col.key === 'select' ? (
                          <input
                            type="checkbox"
                            checked={selectAll && emails.length > 0}
                            onChange={handleSelectAll}
                            className="w-4 h-4 rounded border-[var(--muted)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                            aria-label="Select all emails on this page"
                          />
                        ) : col.sortable ? (
                          <SortHeader
                            label={col.label}
                            field={col.key}
                            sortBy={sortBy}
                            sortOrder={sortOrder}
                            onSort={handleSort}
                            className={`py-3.5 text-[var(--foreground)]/50 ${col.width}`}
                          />
                        ) : (
                          col.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--muted)]">
                  {emails.map((email, rowIndex) => (
                    <motion.tr
                      key={email.email}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: rowIndex * 0.02 }}
                      className={`transition-colors hover:bg-[var(--accent)]/5 ${rowIndex % 2 === 1 ? 'bg-[var(--muted)]/10' : ''}`}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedEmails.has(email.email)}
                          onChange={() => handleSelectEmail(email.email)}
                          className="w-4 h-4 rounded border-[var(--muted)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                          aria-label={`Select ${email.email}`}
                        />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-[var(--foreground)]/30 shrink-0" />
                          <a
                            href={`mailto:${email.email}`}
                            className="font-medium text-[var(--foreground)] hover:text-[var(--accent)] truncate block max-w-xs"
                          >
                            {email.email}
                          </a>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <a
                          href={`https://${email.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--accent)] hover:underline transition-colors flex items-center gap-1"
                        >
                          {email.domain}
                          <ExternalLink className="h-3 w-3 opacity-50" />
                        </a>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge email={email} />
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center justify-center min-w-[2.5rem] rounded-full px-2.5 py-1 font-mono text-sm font-semibold tabular-nums ${scoreColorClass(email.score)}`}>
                          {email.score ?? '\u2014'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <ChecksCell email={email} />
                      </td>
                      <td className="px-4 py-3.5 text-[var(--foreground)]/50 font-mono text-sm">
                        {formatDateTimeIST(email.verified_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`mailto:${email.email}`, '_blank', 'noopener,noreferrer')}
                            aria-label={`Email ${email.email}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (!confirm(`Delete ${email.email}?`)) return;
                              try {
                                await deleteEmail(email.email);
                                refetch();
                              } catch (err) {
                                reportError('EmailListPage.deleteSingle', err, { email: email.email });
                                toast.error(`Failed to delete ${email.email}`);
                              }
                            }}
                            className="text-error hover:text-error hover:bg-error/10"
                            aria-label={`Delete ${email.email}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3.5 border-t border-[var(--muted)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-[var(--foreground)]/50">
                Showing {(page - 1) * size + 1} to {Math.min(page * size, total)} of {total.toLocaleString()} results
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="page-size-select" className="sr-only">Results per page</label>
                <select
                  id="page-size-select"
                  value={size}
                  onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}
                  className="input w-auto py-1.5 text-sm"
                >
                  <option value={10}>10 per page</option>
                  <option value={20}>20 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {getPageWindow(page, totalPages).map((p, idx) =>
                  p === '...' ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-sm text-[var(--foreground)]/40">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`min-w-[2rem] h-8 rounded-lg text-sm font-medium transition-colors ${p === page
                        ? 'bg-[var(--accent)] text-white'
                        : 'hover:bg-[var(--muted)] text-[var(--foreground)]/70'
                        }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
