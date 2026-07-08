import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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

// Motion variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

// Status classifications
const SAFE_STATUSES = ['verified', 'deliverable', 'trusted', 'probably_valid'];
const RISKY_STATUSES = ['risky', 'unconfirmed', 'uncertain'];
const UNSAFE_STATUSES = ['invalid', 'undeliverable'];

// Utility functions
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

function formatAvgTime(timeMs) {
  if (timeMs === null || timeMs === undefined) return '—';
  if (timeMs === 0) return '<1ms';

  if (timeMs >= 1000) {
    const seconds = timeMs / 1000;
    return `${seconds.toFixed(1)}s`;
  } else if (timeMs >= 1) {
    return `${Math.round(timeMs)}ms`;
  }
  return '<1ms';
}

// Sums all numeric fields on a daily_volume entry except the date key,
// so it works regardless of whether the backend sends {date, total} or
// {date, safe, risky, unsafe, processing}.
function dayTotal(entry) {
  return Object.keys(entry).reduce((sum, key) => {
    if (key === 'date') return sum;
    const val = entry[key];
    return typeof val === 'number' ? sum + val : sum;
  }, 0);
}

// Small stat tile used by both the Flagged Emails "Overview" row and the
// Worst Domains "Summary" row — same shape, different data sources.
function MiniStat({ label, value, trend, Icon, iconBg, iconColor }) {
  const isPositive = trend >= 0;
  return (
    <div className="rounded-xl border border-[var(--muted)] p-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl mb-2 ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <p className="text-xl font-bold text-[var(--foreground)]">{value}</p>
      <p className="text-xs text-[var(--foreground)]/50">{label}</p>
      <p className={`text-xs font-medium mt-1 ${isPositive ? 'text-success' : 'text-error'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(trend)}%{' '}
        <span className="text-[var(--foreground)]/40 font-normal">vs last 7 days</span>
      </p>
    </div>
  );
}

// Status Group component
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
      colorClass: 'text-success',
      bgClass: 'bg-success/10 dark:bg-success/20',
      dotClass: 'bg-success',
      badgeClass: 'bg-success/10 text-success dark:bg-success/20 dark:text-success/80',
      footerBgClass: 'bg-success/5 dark:bg-success/10',
      Icon: ShieldCheck,
    },
    Risky: {
      colorClass: 'text-warning',
      bgClass: 'bg-warning/10 dark:bg-warning/20',
      dotClass: 'bg-warning',
      badgeClass: 'bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning/80',
      footerBgClass: 'bg-warning/5 dark:bg-warning/10',
      Icon: AlertTriangle,
    },
    Unsafe: {
      colorClass: 'text-error',
      bgClass: 'bg-error/10 dark:bg-error/20',
      dotClass: 'bg-error',
      badgeClass: 'bg-error/10 text-error dark:bg-error/20 dark:text-error/80',
      footerBgClass: 'bg-error/5 dark:bg-error/10',
      Icon: ShieldX,
    },
    Processing: {
      colorClass: 'text-primary',
      bgClass: 'bg-primary/10 dark:bg-primary/20',
      dotClass: 'bg-primary',
      badgeClass: 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary/80',
      footerBgClass: 'bg-primary/5 dark:bg-primary/10',
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
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ${item.bgClass}`}>
          <Icon className={`h-6 w-6 ${item.colorClass}`} />
        </div>
        <h3 className={`text-xl font-bold ${item.colorClass}`}>{title}</h3>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl font-bold text-[var(--foreground)]">{total.toLocaleString()}</span>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${item.badgeClass}`}>
          {percent}%
        </span>
      </div>

      <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
        <div
          className={`${item.dotClass} h-full rounded-full transition-all duration-700`}
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
                <RowIcon className={`h-4 w-4 ${item.colorClass}`} />
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
                    className={`flex items-center text-xs font-medium ${delta > 0 ? 'text-success' : 'text-error'}`}
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

      <div className={`mt-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs ${item.footerBgClass}`}>
        {isPositiveTrend ? (
          <TrendingUp className="h-4 w-4 text-success shrink-0" />
        ) : (
          <TrendingDown className="h-4 w-4 text-error shrink-0" />
        )}
        <span className="text-[var(--foreground)]/80">
          Trend (24h){' '}
          <span className={isPositiveTrend ? 'text-success font-medium' : 'text-error font-medium'}>
            {isPositiveTrend ? '↑' : '↓'} {Math.abs(trendPct)}%
          </span>{' '}
          {isPositiveTrend ? 'more' : 'less'} than yesterday
        </span>
      </div>
    </div>
  );
}

// Trust Score Card component
function TrustScoreCard({ trustScore, trustScoreColor, trustScoreLabel, textClassMap, badgeClassMap }) {
  return (
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
    </motion.div>
  );
}

// Stats Grid component
function StatsGrid({ totalEmails, bucketCounts }) {
  return (
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
          {(bucketCounts.safe ?? 0).toLocaleString()}
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--foreground)]/50">Risky</p>
        <p className="text-xl font-bold text-warning tabular-nums mt-1">
          {(bucketCounts.risky ?? 0).toLocaleString()}
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--foreground)]/50">Unsafe</p>
        <p className="text-xl font-bold text-error tabular-nums mt-1">
          {(bucketCounts.unsafe ?? 0).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

// Active Job Section component
function ActiveJobSection({ activeJob }) {
  return (
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
        <Button variant="success" size="lg" className="w-full">
          <Zap className="h-5 w-5 text-[var(--foreground)]" />
          Verify Email
        </Button>
      </div>
    </motion.div>
  );
}

// Status Breakdown section component
function StatusBreakdownSection({
  trustScore,
  verifiedCount,
  totalEmails,
  generatedAt,
  flaggedOverview,
  domainSummary,
  perStatusCounts,
  perStatusTrend,
  bucketTrendPct,
  flaggedCounts,
  worstDomains,
  dailyVolume,
  days,
  setDays,
  verificationSpeed,
  avgProcessingTimeMs,
  navigate,
}) {
  const dailyTotals = dailyVolume.map(dayTotal);
  const dailyAverage = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((sum, v) => sum + v, 0) / dailyTotals.length)
    : 0;
  const peakDay = dailyTotals.length > 0 ? Math.max(...dailyTotals) : 0;

  return (
    <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 items-start">
      <div className="card w-full rounded-3xl p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-[var(--foreground)]">Status breakdown</h2>
            <p className="mt-2 text-sm text-[var(--foreground)]/60">Detailed breakdown of verification statuses</p>

            <div className="mt-6 max-w-md">
              <p className="text-sm text-[var(--foreground)]/60">Overall Verification Progress</p>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-4xl font-bold text-success">{trustScore}%</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-success transition-all duration-700"
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
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/20">
                  <Zap className="h-4 w-4 text-primary" />
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
            <p className="mt-2 text-3xl font-bold text-success">{trustScore}%</p>
          </div>

          <div className="rounded-2xl shadow-sm hover:shadow-md transition-all border border-[var(--muted)] p-4">
            <p className="text-sm text-[var(--foreground)]/60">Avg Response Time</p>
            <p className="mt-2 text-3xl font-bold">
              <span>{formatAvgTime(avgProcessingTimeMs)}</span>
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

      <motion.div variants={itemVariants} className="card w-full rounded-3xl min-h-[760px] shadow-lg">
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

        <div className="h-[430px] w-full">
          <StackedBarChart data={dailyVolume} height={430} />
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 dark:bg-success/20">
                <TrendingUp className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--foreground)]/60">Daily Average</p>
                <p className="mt-1 text-3xl font-bold">
                  {dailyAverage.toLocaleString()}
                </p>
                <p className="text-xs text-[var(--foreground)]/50">emails/day</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 dark:bg-warning/20">
                <BarChart3 className="h-8 w-8 text-warning" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--foreground)]/60">Peak Day</p>
                <p className="mt-1 text-3xl font-bold">
                  {peakDay.toLocaleString()}
                </p>
                <p className="text-xs text-[var(--foreground)]/50">highest volume</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
                <Database className="h-8 w-8 text-primary" />
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
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 dark:bg-success/20">
                <PieChart className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--foreground)]/60">Success Rate</p>
                <p className="mt-1 text-3xl font-bold text-success">{trustScore}%</p>
                <p className="text-xs text-[var(--foreground)]/50">overall accuracy</p>
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
                  <ShieldAlert className="h-6 w-6 text-[var(--foreground)]/60" />
                </div>
                <div>
                  <p className="font-semibold">Catch All</p>
                  <p className="text-sm text-[var(--foreground)]/60">Accepts every email</p>
                </div>
              </div>
              <p className="text-3xl font-bold text-[var(--foreground)]">{(flaggedCounts.catch_all || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Overview row */}
          <div className="mt-6 pt-6 border-t border-[var(--muted)]">
            <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Overview</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniStat
                label="Total Flagged"
                value={flaggedOverview.total_flagged.toLocaleString()}
                trend={flaggedOverview.total_flagged_trend_pct}
                Icon={MailWarning}
                iconBg="bg-violet-100 dark:bg-violet-900/20"
                iconColor="text-violet-600"
              />
              <MiniStat
                label="High Priority"
                value={flaggedOverview.high_priority.toLocaleString()}
                trend={flaggedOverview.high_priority_trend_pct}
                Icon={AlertTriangle}
                iconBg="bg-red-100 dark:bg-red-900/20"
                iconColor="text-red-600"
              />
              <MiniStat
                label="Flag Rate"
                value={`${flaggedOverview.flag_rate}%`}
                trend={flaggedOverview.flag_rate_trend_pct}
                Icon={PieChart}
                iconBg="bg-amber-100 dark:bg-amber-900/20"
                iconColor="text-amber-600"
              />
              <MiniStat
                label="Last 7 Days"
                value={flaggedOverview.last_7_days.toLocaleString()}
                trend={flaggedOverview.last_7_days_trend_pct}
                Icon={CalendarClock}
                iconBg="bg-blue-100 dark:bg-blue-900/20"
                iconColor="text-[var(--foreground)]/60"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-red-50 dark:bg-red-900/10 p-4">
            <div>
              <p className="font-semibold text-red-600">Review flagged emails to improve deliverability</p>
              <p className="text-xs text-[var(--foreground)]/60">Regular review helps maintain a clean email list</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/emails?filter=flagged')}>
              Review Now
            </Button>
          </div>
        </div>

        <div className="card h-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Worst Domains</h2>
              <p className="text-sm text-[var(--foreground)]/60">Highest risk domains detected</p>
            </div>
            <Globe className="h-8 w-8 text-[var(--foreground)]/60" />
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
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${d.risk_pct >= 50
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                        : 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
                        }`}
                    >
                      {d.risk_pct}%
                    </span>
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-20 h-1.5 rounded-full bg-[var(--muted)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${d.risk_pct >= 50 ? 'bg-red-500' : 'bg-amber-500'}`}
                          style={{ width: `${d.risk_pct}%` }}
                        />
                      </div>
                      <AlertTriangle
                        className={`h-3.5 w-3.5 ${d.risk_pct >= 50 ? 'text-red-500' : 'text-amber-500'}`}
                      />
                      <span className="text-xs text-[var(--foreground)]/50 whitespace-nowrap">
                        {d.total} emails
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Summary row */}
          <div className="mt-6 pt-6 border-t border-[var(--muted)]">
            <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Summary</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniStat
                label="Avg Reputation"
                value={`${domainSummary.avg_reputation}%`}
                trend={domainSummary.avg_reputation_trend_pct}
                Icon={ShieldCheck}
                iconBg="bg-violet-100 dark:bg-violet-900/20"
                iconColor="text-violet-600"
              />
              <MiniStat
                label="High Risk"
                value={domainSummary.high_risk_count}
                trend={domainSummary.high_risk_trend_pct}
                Icon={AlertTriangle}
                iconBg="bg-amber-100 dark:bg-amber-900/20"
                iconColor="text-amber-600"
              />
              <MiniStat
                label="Total Domains"
                value={domainSummary.total_domains}
                trend={domainSummary.total_domains_trend_pct}
                Icon={Globe}
                iconBg="bg-blue-100 dark:bg-blue-900/20"
                iconColor="text-[var(--foreground)]/60"
              />
              <MiniStat
                label="Improving"
                value={domainSummary.improving_count}
                trend={domainSummary.improving_trend_pct}
                Icon={TrendingUp}
                iconBg="bg-success/10 dark:bg-success/20"
                iconColor="text-success"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-blue-50 dark:bg-blue-900/10 p-4">
            <div>
              <p className="font-semibold text-warning">High risk domains impact deliverability</p>
              <p className="text-xs text-[var(--foreground)]/60">Monitor and take action on risky domains</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/domains')}>
              View All Domains
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
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
    total_emails: totalEmails = 0,
    per_status_counts: perStatusCounts = {},
    bucket_counts: bucketCounts = {},
    trust_score: trustScore = 0,
    flagged_counts: flaggedCounts = {},
    top_domains: topDomains = [],
    daily_volume: dailyVolume = [],
    active_job: activeJob = null,
    per_status_trend: perStatusTrend = {},
    bucket_trend_pct: bucketTrendPct = {},
    verification_speed: verificationSpeed = 0,
    avg_processing_time_ms: avgProcessingTimeMs = 0,
    flagged_overview: flaggedOverview = { total_flagged: 0, high_priority: 0, flag_rate: 0, last_7_days: 0, total_flagged_trend_pct: 0, high_priority_trend_pct: 0, flag_rate_trend_pct: 0, last_7_days_trend_pct: 0 },
    domain_summary: domainSummary = { avg_reputation: 0, high_risk_count: 0, total_domains: 0, improving_count: 0, total_domains_trend_pct: 0, improving_trend_pct: 0 },
    generated_at: generatedAt = new Date().toISOString(),
  } = stats || {};

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

  const verifiedCount = (bucketCounts.safe || 0) + (bucketCounts.risky || 0) + (bucketCounts.unsafe || 0);

  // Find worst domains (highest risk)
  const worstDomains = [...(topDomains || [])]
    .filter((d) => d.total >= 5)
    .sort((a, b) => b.risk_pct - a.risk_pct)
    .slice(0, 5);

  return (
    <motion.div id="main-content" initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
      {/* Skip navigation link for accessibility */}
      <a href="#main-content" className="absolute left-0 top-0 bg-[var(--accent)] text-white px-4 py-2 z-50 transform -translate-y-full focus:translate-y-0 transition-transform duration-300">
        Skip to main content
      </a>

      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="text-sm text-[var(--foreground)]/60">Overview of your email verification activity</p>
      </motion.div>

      <TrustScoreCard
        trustScore={trustScore}
        trustScoreColor={trustScoreColor}
        trustScoreLabel={trustScoreLabel}
        textClassMap={textClassMap}
        badgeClassMap={badgeClassMap}
      />

      <StatsGrid
        totalEmails={totalEmails}
        bucketCounts={bucketCounts}
      />

      <ActiveJobSection activeJob={activeJob} />

      <StatusBreakdownSection
        trustScore={trustScore}
        verifiedCount={verifiedCount}
        totalEmails={totalEmails}
        generatedAt={generatedAt}
        flaggedOverview={flaggedOverview}
        domainSummary={domainSummary}
        perStatusCounts={perStatusCounts}
        perStatusTrend={perStatusTrend}
        bucketTrendPct={bucketTrendPct}
        flaggedCounts={flaggedCounts}
        worstDomains={worstDomains}
        dailyVolume={dailyVolume}
        days={days}
        setDays={setDays}
        verificationSpeed={verificationSpeed}
        avgProcessingTimeMs={avgProcessingTimeMs}
        navigate={navigate}
      />
    </motion.div>
  );
}
