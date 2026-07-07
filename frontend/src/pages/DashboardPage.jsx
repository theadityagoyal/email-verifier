import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import CircularProgress from '@/components/ui/CircularProgress';
import StackedBarChart from '@/components/charts/StackedBarChart';
import { getDashboardStats } from '@/services/api';
import Button from '@/components/ui/Button';
import {
  Globe,
  Zap,
  ShieldCheck,
  CircleCheckBig,
  AlertTriangle,
  ShieldX,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Database,
  PieChart,
  MailWarning,
  Trash2,
  Users,
  ShieldAlert,
  MailCheck,
  BadgeCheck,
  MailX,
  HelpCircle,
  Clock,
  CalendarClock,
} from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const SAFE_STATUSES = ['verified', 'deliverable', 'trusted', 'probably_valid'];
const RISKY_STATUSES = ['risky', 'unconfirmed', 'uncertain'];
const UNSAFE_STATUSES = ['invalid', 'undeliverable'];

function relativeTime(isoString) {
  if (!isoString) return '—';
  const then = new Date(isoString);
  const diffMs = Date.now() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 30) return 'Just now';
  if (diffSec < 60) return `${diffSec} sec ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function StatusGroup({ title, statuses, perStatusCounts, totalEmails, perStatusTrend, bucketTrendPct }) {
  const rows = statuses
    .filter((s) => title === 'Processing' || (perStatusCounts[s] || 0) > 0)
    .sort((a, b) => (perStatusCounts[b] || 0) - (perStatusCounts[a] || 0));

  const total = rows.reduce((sum, status) => sum + (perStatusCounts[status] || 0), 0);
  const percent = totalEmails > 0 ? ((total / totalEmails) * 100).toFixed(1) : '0.0';

  const bucketKey = title.toLowerCase();
  const trendPct = bucketTrendPct?.[bucketKey] ?? 0;
  const isPositiveTrend = trendPct >= 0;

  const config = {
    Safe: {
      color: 'text-emerald-600',
      bg: 'bg-emerald-100 dark:bg-emerald-900/20',
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
      footerBg: 'bg-emerald-50 dark:bg-emerald-900/10',
      Icon: ShieldCheck,
    },
    Risky: {
      color: 'text-amber-500',
      bg: 'bg-amber-100 dark:bg-amber-900/20',
      dot: 'bg-amber-500',
      badge: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
      footerBg: 'bg-amber-50 dark:bg-amber-900/10',
      Icon: AlertTriangle,
    },
    Unsafe: {
      color: 'text-red-500',
      bg: 'bg-red-100 dark:bg-red-900/20',
      dot: 'bg-red-500',
      badge: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
      footerBg: 'bg-red-50 dark:bg-red-900/10',
      Icon: ShieldX,
    },
    Processing: {
      color: 'text-blue-500',
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      dot: 'bg-blue-500',
      badge: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
      footerBg: 'bg-blue-50 dark:bg-blue-900/10',
      Icon: RefreshCw,
    },
  };

  const item = config[title];
  if (!item) return null;

  const Icon = item.Icon;
  const statusIcons = {
    verified: CircleCheckBig,
    deliverable: MailCheck,
    trusted: ShieldCheck,
    probably_valid: BadgeCheck,
    risky: AlertTriangle,
    unconfirmed: HelpCircle,
    uncertain: HelpCircle,
    invalid: ShieldX,
    undeliverable: MailX,
    processing: RefreshCw,
  };

  return (
    <div className="py-5 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${item.bg}`}>
          <Icon className={`h-6 w-6 ${item.color}`} />
        </div>
        <h3 className={`text-xl font-bold ${item.color}`}>{title}</h3>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl font-bold text-[var(--foreground)]">{total.toLocaleString()}</span>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${item.badge}`}>
          {percent}%
        </span>
      </div>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className={`${item.dot} h-full rounded-full transition-all duration-700`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="space-y-2 flex-1">
        {rows.map((status) => {
          const count = perStatusCounts[status] || 0;
          const pct = totalEmails > 0 ? ((count / totalEmails) * 100).toFixed(1) : '0.0';
          const RowIcon = statusIcons[status] || HelpCircle;
          const delta = perStatusTrend?.[status] ?? 0;

          return (
            <div
              key={status}
              className="flex items-center justify-between rounded-xl border border-[var(--muted)] px-3 py-2.5 transition-all duration-200 hover:shadow-sm"
            >
              <div className="flex items-center gap-2">
                <RowIcon className={`h-4 w-4 ${item.color}`} />
                <span className="text-sm font-medium text-[var(--foreground)] capitalize">
                  {status.replace(/_/g, ' ')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--foreground)]">
                  {count.toLocaleString()}{' '}
                  <span className="text-xs font-normal text-[var(--foreground)]/50">({pct}%)</span>
                </span>
                {delta !== 0 && (
                  <span
                    className={`flex items-center text-xs font-medium ${delta > 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}
                  >
                    {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {title === 'Processing' && total === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--muted)] px-3 py-2.5 text-xs text-[var(--foreground)]/60">
            <Users className="h-4 w-4" />
            No emails in queue
          </div>
        )}
      </div>

      <div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${item.footerBg}`}>
        {isPositiveTrend ? (
          <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <TrendingDown className="h-4 w-4 text-red-500 shrink-0" />
        )}
        <span className="text-[var(--foreground)]/80">
          Trend (24h){' '}
          <span className={isPositiveTrend ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
            {isPositiveTrend ? '↑' : '↓'} {Math.abs(trendPct)}%
          </span>{' '}
          {isPositiveTrend ? 'more' : 'less'} than yesterday
        </span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [days, setDays] = useState(7);

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats', days],
    queryFn: () => getDashboardStats(days),
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (isLoading) {
    return (
      <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
        <motion.h1 className="text-3xl font-bold text-[var(--foreground)]" variants={itemVariants}>
          Dashboard
        </motion.h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <motion.div key={i} variants={itemVariants} className="card h-32 animate-pulse">
              <div className="h-4 w-3/4 bg-[var(--foreground)]/10 rounded mb-4" />
              <div className="h-8 w-1/2 bg-[var(--foreground)]/10 rounded" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <AlertTriangle className="h-12 w-12 text-error mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Failed to load dashboard</h2>
        <p className="text-[var(--foreground)]/60">{error.message}</p>
      </div>
    );
  }

  const {
    total_emails: totalEmails,
    per_status_counts: perStatusCounts,
    bucket_counts: bucketCounts,
    trust_score: trustScore,
    flagged_counts: flaggedCounts,
    top_domains: topDomains,
    daily_volume: dailyVolume,
    active_job: activeJob,
    per_status_trend: perStatusTrend,
    bucket_trend_pct: bucketTrendPct,
    verification_speed: verificationSpeed,
    avg_processing_time_ms: avgProcessingTimeMs,
    generated_at: generatedAt,
  } = stats;

  const trustScoreColor = trustScore >= 60 ? 'success' : trustScore >= 40 ? 'warning' : 'error';
  const trustScoreLabel = trustScore >= 60 ? 'safe to send' : 'needs review';
  const badgeClassMap = {
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    error: 'bg-error/15 text-error',
  };
  const textClassMap = {
    success: 'text-success',
    warning: 'text-warning',
    error: 'text-error',
  };

  const worstDomains = [...(topDomains || [])]
    .filter((d) => d.total >= 5)
    .sort((a, b) => b.risk_pct - a.risk_pct)
    .slice(0, 5);

  const verifiedCount = bucketCounts.safe + bucketCounts.risky + bucketCounts.unsafe;

  // ── CORRECTED: Format average processing time ─────────────────────────────
  // The value is in milliseconds (e.g., 200.6 means 200.6ms)
  const formatAvgTime = (timeMs) => {
    if (timeMs === null || timeMs === undefined) return '—';
    if (timeMs === 0) return '<1ms';

    // Value is in milliseconds - display appropriately
    if (timeMs >= 1000) {
      // >= 1 second - show in seconds
      const seconds = timeMs / 1000;
      return `${seconds.toFixed(1)}s`;
    } else if (timeMs >= 1) {
      // Between 1ms and 999ms - show in milliseconds
      return `${Math.round(timeMs)}ms`;
    } else {
      // Less than 1ms
      return '<1ms';
    }
  };

  // For debugging - log the actual value
  console.log('Avg Processing Time (ms):', avgProcessingTimeMs);
  console.log('Formatted:', formatAvgTime(avgProcessingTimeMs));

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="text-sm text-[var(--foreground)]/60">Overview of your email verification activity</p>
      </motion.div>

      <motion.div variants={itemVariants} className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]/60">Trust score</p>
            <p className={`text-5xl font-bold mt-1 ${textClassMap[trustScoreColor]}`}>{trustScore}%</p>
            <div className="mt-2">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-md ${badgeClassMap[trustScoreColor]}`}>
                {trustScoreLabel}
              </span>
            </div>
          </div>
          <CircularProgress value={trustScore} size={90} strokeWidth={8} color={trustScoreColor} />
        </div>

        <div className="grid grid-cols-4 gap-4 pt-4 mt-4 border-t border-[var(--muted)]">
          <div>
            <p className="text-xs text-[var(--foreground)]/50">Total emails</p>
            <p className="text-xl font-bold text-[var(--foreground)] tabular-nums mt-1">
              {totalEmails.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground)]/50">Safe</p>
            <p className="text-xl font-bold text-success tabular-nums mt-1">
              {bucketCounts.safe.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground)]/50">Risky</p>
            <p className="text-xl font-bold text-warning tabular-nums mt-1">
              {bucketCounts.risky.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--foreground)]/50">Unsafe</p>
            <p className="text-xl font-bold text-error tabular-nums mt-1">
              {bucketCounts.unsafe.toLocaleString()}
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
        <div className="card h-full">
          <p className="text-xs text-[var(--foreground)]/50 mb-2">Active job</p>
          {activeJob ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-[var(--foreground)] truncate">{activeJob.file_name}</p>
              <div className="w-full bg-[var(--muted)] rounded-full h-2">
                <div
                  className="h-2 bg-[var(--primary)] rounded-full transition-all duration-500"
                  style={{ width: `${activeJob.progress_percent}%` }}
                />
              </div>
              <p className="text-xs text-[var(--foreground)]/50">
                {activeJob.progress_percent}% · {activeJob.processed}/{activeJob.total}
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--foreground)]/50 py-2">No active jobs</p>
          )}
        </div>

        <div className="card flex h-full items-center justify-center">
          <p className="text-sm text-[var(--foreground)]/50">Credits tracking not implemented</p>
        </div>

        <div className="card flex h-full items-center justify-center">
          <Button variant="success" size="lg" className="w-full" onClick={() => navigate('/verify')}>
            <Zap className="h-5 w-5" />
            Verify Email
          </Button>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 items-start">
        <div className="card w-full rounded-3xl p-8 shadow-lg">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-[var(--foreground)]">Status breakdown</h2>
              <p className="mt-2 text-sm text-[var(--foreground)]/60">Detailed breakdown of verification statuses</p>

              <div className="mt-6 max-w-md">
                <p className="text-sm text-[var(--foreground)]/60">Overall Verification Progress</p>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-4xl font-bold text-emerald-600">{trustScore}%</span>
                  <div className="flex-1 h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-emerald-500 transition-all duration-700"
                      style={{ width: `${trustScore}%` }}
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--foreground)]/50">
                  {verifiedCount.toLocaleString()} of {totalEmails.toLocaleString()} emails verified
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <CircularProgress value={trustScore} size={110} strokeWidth={9} color="success" />

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--muted)]/60">
                    <Clock className="h-4 w-4 text-[var(--foreground)]/70" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--foreground)]/50">Last updated</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{relativeTime(generatedAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/20">
                    <Zap className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--foreground)]/50">Verification speed</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">{verificationSpeed} emails/sec</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-[var(--muted)] mb-2" />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:pr-4 md:border-r md:border-[var(--muted)]">
              <StatusGroup
                title="Safe"
                statuses={SAFE_STATUSES}
                perStatusCounts={perStatusCounts}
                totalEmails={totalEmails}
                perStatusTrend={perStatusTrend}
                bucketTrendPct={bucketTrendPct}
              />
            </div>

            <div className="md:px-4 md:border-r md:border-[var(--muted)]">
              <StatusGroup
                title="Risky"
                statuses={RISKY_STATUSES}
                perStatusCounts={perStatusCounts}
                totalEmails={totalEmails}
                perStatusTrend={perStatusTrend}
                bucketTrendPct={bucketTrendPct}
              />
            </div>

            <div className="md:px-4 md:border-r md:border-[var(--muted)]">
              <StatusGroup
                title="Unsafe"
                statuses={UNSAFE_STATUSES}
                perStatusCounts={perStatusCounts}
                totalEmails={totalEmails}
                perStatusTrend={perStatusTrend}
                bucketTrendPct={bucketTrendPct}
              />
            </div>

            <div className="md:pl-4">
              <StatusGroup
                title="Processing"
                statuses={['processing']}
                perStatusCounts={perStatusCounts}
                totalEmails={totalEmails}
                perStatusTrend={perStatusTrend}
                bucketTrendPct={bucketTrendPct}
              />
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--muted)] p-4">
              <p className="text-sm text-[var(--foreground)]/60">Total Emails</p>
              <p className="mt-2 text-3xl font-bold">{totalEmails.toLocaleString()}</p>
            </div>

            <div className="rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--muted)] p-4">
              <p className="text-sm text-[var(--foreground)]/60">Success Rate</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{trustScore}%</p>
            </div>

            {/* ── CORRECTED: Avg Response Time display ────────────────────────── */}
            <div className="rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--muted)] p-4">
              <p className="text-sm text-[var(--foreground)]/60">Avg Response Time</p>
              <p className="mt-2 text-3xl font-bold">
                {formatAvgTime(avgProcessingTimeMs)}
              </p>
              <p className="text-xs text-[var(--foreground)]/50">Per email</p>
            </div>

            <div className="rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--muted)] p-4">
              <p className="text-sm text-[var(--foreground)]/60">Last Sync</p>
              <p className="mt-2 text-3xl font-bold">{relativeTime(generatedAt)}</p>
              <div className="flex items-center gap-1 text-xs text-[var(--foreground)]/50">
                <CalendarClock className="h-3 w-3" />
                Auto-refreshes every 3s
              </div>
            </div>
          </div>
        </div>

        <div className="card w-full rounded-3xl min-h-[760px] shadow-lg">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Verification Volume</h2>
              <p className="mt-1 text-sm text-[var(--foreground)]/60">Daily email verification activity</p>
            </div>

            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-xl border border-[var(--muted)] bg-[var(--background)] px-4 py-2 text-sm shadow-sm"
            >
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
              <option value={90}>Last 90 Days</option>
              <option value={365}>All Time</option>
            </select>
          </div>

          <StackedBarChart data={dailyVolume} height={430} />

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/20">
                  <TrendingUp className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">Daily Average</p>
                  <p className="mt-1 text-3xl font-bold">
                    {dailyVolume.length
                      ? Math.round(
                        dailyVolume.reduce(
                          (sum, d) => sum + (d.safe || 0) + (d.risky || 0) + (d.unsafe || 0) + (d.processing || 0),
                          0
                        ) / dailyVolume.length
                      ).toLocaleString()
                      : 0}
                  </p>
                  <p className="text-xs text-[var(--foreground)]/50">emails/day</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/20">
                  <BarChart3 className="h-8 w-8 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">Peak Day</p>
                  <p className="mt-1 text-3xl font-bold">
                    {dailyVolume.length
                      ? Math.max(
                        ...dailyVolume.map(
                          (d) => (d.safe || 0) + (d.risky || 0) + (d.unsafe || 0) + (d.processing || 0)
                        )
                      ).toLocaleString()
                      : 0}
                  </p>
                  <p className="text-xs text-[var(--foreground)]/50">highest volume</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/20">
                  <Database className="h-8 w-8 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">Total Volume</p>
                  <p className="mt-1 text-3xl font-bold">{totalEmails.toLocaleString()}</p>
                  <p className="text-xs text-[var(--foreground)]/50">emails</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/20">
                  <PieChart className="h-8 w-8 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">Success Rate</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-600">{trustScore}%</p>
                  <p className="text-xs text-[var(--foreground)]/50">overall accuracy</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card h-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">Flagged Emails</h2>
              <p className="mt-1 text-sm text-[var(--foreground)]/60">Emails requiring manual review</p>
            </div>
            <MailWarning className="h-8 w-8 text-amber-500" />
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl bg-red-50 dark:bg-red-900/20 p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-red-100 dark:bg-red-900/30 p-3">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <p className="font-semibold">Disposable</p>
                  <p className="text-sm text-[var(--foreground)]/60">Temporary email providers</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-red-600">{(flaggedCounts.disposable || 0).toLocaleString()}</p>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-amber-50 dark:bg-amber-900/20 p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-3">
                  <Users className="h-6 w-6 text-amber-600" />
                </div>
                <div>
                  <p className="font-semibold">Role Based</p>
                  <p className="text-sm text-[var(--foreground)]/60">Shared business inboxes</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-amber-600">{(flaggedCounts.role_based || 0).toLocaleString()}</p>
            </div>

            <div className="flex items-center justify-between rounded-2xl bg-blue-50 dark:bg-blue-900/20 p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-blue-100 dark:bg-blue-900/30 p-3">
                  <ShieldAlert className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold">Catch All</p>
                  <p className="text-sm text-[var(--foreground)]/60">Accepts every email</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-blue-600">{(flaggedCounts.catch_all || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card h-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Worst Domains</h2>
              <p className="text-sm text-[var(--foreground)]/60">Highest risk domains detected</p>
            </div>
            <Globe className="h-8 w-8 text-blue-600" />
          </div>

          {worstDomains.length === 0 ? (
            <div className="py-10 text-center text-[var(--foreground)]/50">No risky domains found</div>
          ) : (
            <div className="space-y-3">
              {worstDomains.map((d) => (
                <div
                  key={d.domain}
                  className="flex items-center justify-between rounded-xl border border-[var(--muted)] p-4"
                >
                  <div>
                    <p className="font-semibold">{d.domain}</p>
                    <p className="text-xs text-[var(--foreground)]/50">Domain Reputation</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${d.risk_pct >= 50
                      ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                      : 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                      }`}
                  >
                    {d.risk_pct}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}