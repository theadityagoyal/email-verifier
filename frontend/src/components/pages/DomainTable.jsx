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
} from 'lucide-react';
import Button from '@/components/ui/Button';

export default function DomainTable({
  filteredDomains,
  selected,
  setSelected,
  toggleSelectAll,
  toggleSelectOne,
  openMenu,
  setOpenMenu,
}) {
  // Mock VERDICT_CONFIG and TREND_CONFIG - these would normally be imported
  const VERDICT_CONFIG = {
    Healthy: {
      icon: <span className="text-emerald-600" />, // Simplified for demo
      badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    },
    Watch: {
      icon: <span className="text-amber-600" />,
      badge: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
    },
    'High Risk': {
      icon: <span className="text-red-600" />,
      badge: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
    },
    'Low Sample': {
      icon: <span className="text-slate-500" />,
      badge: 'bg-slate-100 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400',
    },
  };

  const TREND_CONFIG = {
    up: { icon: <span className="text-red-500" />, color: 'text-red-500' },
    down: { icon: <span className="text-emerald-500" />, color: 'text-emerald-500' },
    stable: { icon: <span className="text-[var(--foreground)]/40" />, color: 'text-[var(--foreground)]/40' },
  };

  const MX_STATUS_COLOR = {
    Valid: 'text-emerald-600',
    'No MX': 'text-red-600',
    Unknown: 'text-[var(--foreground)]/40',
  };

  // Mock formatDate function if not available
  const formatDateFn = (value) => {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
                  // Simplified verdict and trend config access
                  const verdictConfig = VERDICT_CONFIG[domain.verdict] || VERDICT_CONFIG.Healthy;
                  const trendConfig = TREND_CONFIG[domain.trend] || TREND_CONFIG.stable;
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
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${verdictConfig.badge}`}>
                            {verdictConfig.icon}
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
                                className={`h-full rounded-full ${domain.risk_percent >= 30 ? 'bg-red-500' : domain.risk_percent >= 10 ? 'bg-amber-500' : 'bg-emerald-500'
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
                          <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${trendConfig.color}`}>
                            {trendConfig.icon}
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
                        {formatDateFn(domain.first_seen)}
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
                              <button onClick={() => window.open(`https://${domain.domain}`, '_blank')}
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
        </>
      )}
    </motion.div>
  );
}