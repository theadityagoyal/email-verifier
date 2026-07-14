import { useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Globe,
  ExternalLink,
  Sparkles,
  Trash2,
  Mail,
  Ban,
  MoreVertical,
  RefreshCw,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import SortHeader from './SortHeader';
import { RISK_THRESHOLDS, riskBarColorClass } from '@/utils/scoreThresholds';

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

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: 'text-red-500' },
  down: { icon: TrendingDown, color: 'text-emerald-500' },
  stable: { icon: Minus, color: 'text-[var(--foreground)]/40' },
};

const MX_STATUS_COLOR = {
  Valid: 'text-emerald-600',
  'No MX': 'text-red-600',
  Unknown: 'text-[var(--foreground)]/40',
};

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function DomainTable({
  filteredDomains,
  selected,
  setSelected,
  toggleSelectAll,
  toggleSelectOne,
  openMenu,
  setOpenMenu,
  sortBy,
  sortOrder,
  onSort,
  isSorting = false,
  // FIX (audit #9): navigate is now passed down from DomainsPage (which owns
  // useNavigate()) instead of this component reaching for
  // window.location.href, which caused a full page reload / lost SPA state
  // every time a row or "View Emails" was clicked.
  navigate,
}) {
  // FIX (audit #29): Escape closes the open row-actions menu.
  useEffect(() => {
    if (!openMenu) return;
    const handler = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openMenu, setOpenMenu]);

  const goToDomainEmails = (domain) => {
    navigate(`/emails?domain=${encodeURIComponent(domain)}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="card overflow-hidden !p-0"
    >
      {filteredDomains.length === 0 ? (
        <div className="p-12 text-center">
          <Globe className="h-16 w-16 text-[var(--foreground)]/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">No domains found</h3>
          <p className="text-[var(--foreground)]/50">
            Upload emails via Bulk Upload to populate domain analytics
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto relative">
            {isSorting && (
              <div className="absolute inset-0 z-10 bg-[var(--background)]/40 backdrop-blur-[1px] pointer-events-none flex items-start justify-center pt-10">
                <div className="flex items-center gap-2 rounded-full bg-[var(--background)] border border-[var(--muted)] px-3 py-1.5 text-xs text-[var(--foreground)]/60 shadow-sm">
                  <span className="h-3 w-3 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                  Sorting…
                </div>
              </div>
            )}

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

                  <SortHeader label="Domain" field="domain" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="min-w-[180px]" />
                  <SortHeader label="Total Emails" field="total_emails" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-24" />
                  <SortHeader label="Safe" field="safe" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-20" />
                  <SortHeader label="Risky" field="risky" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-20" />
                  <SortHeader label="Unsafe" field="unsafe" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-20" />
                  <SortHeader label="Risk %" field="risk_percent" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-32" />
                  <SortHeader label="7D Trend" field="trend" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-24" />
                  <SortHeader label="MX Status" field="mx_status" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-24" />

                  <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-24">
                    Flags
                  </th>

                  <SortHeader label="First Seen" field="first_seen" sortBy={sortBy} sortOrder={sortOrder} onSort={onSort} className="w-28" />

                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--foreground)]/50 uppercase tracking-wider w-40">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--muted)]">
                {filteredDomains.map((domain, rowIndex) => {
                  const verdictConfig = VERDICT_CONFIG[domain.verdict] || VERDICT_CONFIG.Healthy;
                  const trendConfig = TREND_CONFIG[domain.trend] || TREND_CONFIG.stable;
                  const VerdictIcon = verdictConfig.icon;
                  const TrendIcon = trendConfig.icon;
                  const isRisky = domain.verdict === 'High Risk' || domain.verdict === 'Watch';
                  const isLowSample = domain.low_sample;

                  return (
                    <motion.tr
                      key={domain.domain}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: rowIndex * 0.02 }}
                      className="hover:bg-[var(--muted)]/30 transition-colors cursor-pointer"
                      onClick={() => goToDomainEmails(domain.domain)}
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
                              // FIX (audit #15): explicit noopener,noreferrer
                              // — without it, the opened page can access
                              // window.opener and redirect this tab
                              // (reverse tabnabbing).
                              window.open(`https://${domain.domain}`, '_blank', 'noopener,noreferrer');
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verdictConfig.badge}`}>
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
                            {/* FIX (audit #26): thresholds now come from the
                                shared scoreThresholds.js constants instead of
                                magic numbers 30/10 hardcoded here (and
                                independently in 4 other places). */}
                            <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full ${riskBarColorClass(domain.risk_percent ?? 0)}`}
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
                          <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${trendConfig.color}`}>
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
                            // FIX (audit #10): "Block Domain" had no
                            // onClick at all — clicking silently did
                            // nothing. Disabled with an explicit "Coming
                            // soon" tooltip instead of a dead, misleading
                            // affordance.
                            <Button
                              variant="outline"
                              size="sm"
                              disabled
                              title="Coming soon"
                              className="text-error border-error/40 opacity-60 cursor-not-allowed"
                            >
                              <Ban className="h-3.5 w-3.5" />
                              Block Domain
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => goToDomainEmails(domain.domain)}
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
                            <div className="absolute right-0 top-8 z-10 w-44 rounded-lg border border-[var(--muted)] bg-[var(--background)] shadow-lg py-1">
                              <button
                                onClick={() => goToDomainEmails(domain.domain)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/40"
                              >
                                <Mail className="h-3.5 w-3.5" />
                                View Emails
                              </button>
                              {/* FIX (audit #10): "Reverify" had no
                                  onClick — disabled + labeled instead of a
                                  silent no-op. */}
                              <button
                                disabled
                                title="Coming soon"
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]/40 cursor-not-allowed"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                Reverify (coming soon)
                              </button>
                              <button
                                onClick={() => window.open(`https://${domain.domain}`, '_blank', 'noopener,noreferrer')}
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)]/80 hover:bg-[var(--muted)]/40"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Website
                              </button>
                              <button
                                disabled
                                title="Coming soon"
                                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-error/40 cursor-not-allowed"
                              >
                                <Ban className="h-3.5 w-3.5" />
                                Block Domain (coming soon)
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
        </>
      )}
    </motion.div>
  );
}
