import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import CircularProgress from '@/components/ui/CircularProgress';
import StackedBarChart from '@/components/charts/StackedBarChart';
import { getDashboardStats } from '@/services/api';
import { APP_USER } from '@/utils/appConfig';

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
  Info,
  CalendarClock,
  Mail,
  Sparkles,
  Star,
} from 'lucide-react';
import { formatDateTimeIST, formatAvgTime, relativeTime } from '@/utils/dateUtils';

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

// FIX (audit #36): tab-visibility hook — pauses expensive polling
// (dashboard/stats runs ~10 aggregate queries per call) while the tab isn't
// actually being looked at.
function useIsTabVisible() {
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible;
}

function dayTotal(entry) {
  return Object.keys(entry).reduce((sum, key) => {
    if (key === 'date') return sum;
    const val = entry[key];
    return typeof val === 'number' ? sum + val : sum;
  }, 0);
}

// ── UI/UX FIX: reusable, accessible info tooltip ────────────────────────────
// Small "?" affordance next to a label. Hover/focus reveals a short
// explanation popover. Used to clarify metrics whose meaning isn't obvious
// at a glance (e.g. "Improving").
function InfoTooltip({ text, className = '' }) {
  return (
    <span className={`group/tip relative inline-flex ${className}`}>
      <button
        type="button"
        tabIndex={0}
        className="inline-flex items-center justify-center rounded-full text-[var(--foreground)]/30 hover:text-[var(--primary)] focus-visible:text-[var(--primary)] transition-colors duration-150 cursor-help"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-normal leading-relaxed text-[var(--foreground)]/80 opacity-0 shadow-xl transition-all duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 translate-y-1 group-hover/tip:translate-y-0"
      >
        {text}
      </span>
    </span>
  );
}

// FIX (audit #17): MiniStat now takes an explicit `windowLabel` prop instead
// of a hardcoded "vs last 7 days" caption. Some of these stats are actually
// 24h-vs-previous-24h deltas on the backend — the old fixed caption
// mislabeled every one of them the same way regardless of the real window.
// Also now supports an optional `tooltip` string for metrics whose meaning
// isn't self-evident (see UI/UX fix #2 — "Improving").
function MiniStat({ label, value, trend, windowLabel, Icon, iconBg, iconColor, tooltip }) {
  const isPositive = trend >= 0;
  return (
    <div className="rounded-xl border border-[var(--muted)] p-3 transition-all duration-200 hover:border-[var(--foreground)]/15 hover:shadow-sm hover:-translate-y-0.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl mb-2 transition-transform duration-200 ${iconBg}`}>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <p className="text-xl font-bold text-[var(--foreground)]">{value}</p>
      <p className="text-xs text-[var(--foreground)]/50 flex items-center gap-1">
        {label}
        {tooltip && <InfoTooltip text={tooltip} />}
      </p>
      <p className={`text-xs font-medium mt-1 ${isPositive ? 'text-success' : 'text-error'}`}>
        {isPositive ? '↑' : '↓'} {Math.abs(trend)}%{' '}
        <span className="text-[var(--foreground)]/40 font-normal">{windowLabel}</span>
      </p>
    </div>
  );
}

function MiniSparkline({ data, color }) {
  if (!data || data.length < 2) return null;
  const gradId = `spark-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TopStatCard({ label, value, trendPct, sparkData, color, Icon, iconBg, iconColor }) {
  const isPositive = trendPct >= 0;
  return (
    <motion.div
      variants={itemVariants}
      className="card !p-5 group cursor-default"
      whileHover={{ y: -3 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <span className={`text-xs font-semibold ${isPositive ? 'text-success' : 'text-error'}`}>
          {isPositive ? '↑' : '↓'} {Math.abs(trendPct)}%
        </span>
      </div>
      <p className="text-sm text-[var(--foreground)]/50">{label}</p>
      <p className="text-2xl font-bold text-[var(--foreground)] tabular-nums mt-1">
        {value.toLocaleString()}
      </p>
      <div className="mt-2 h-10">
        <MiniSparkline data={sparkData} color={color} />
      </div>
    </motion.div>
  );
}

function StatusGroup({ title, statuses, perStatusCounts, bucketTotal, totalEmails, perStatusTrend, bucketTrendPct }) {
  const rows = statuses
    .filter((s) => title === 'Processing' || (perStatusCounts[s] || 0) > 0)
    .sort((a, b) => (perStatusCounts[b] || 0) - (perStatusCounts[a] || 0));

  const total = bucketTotal ?? 0;
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
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 hover:scale-105 ${item.bgClass}`}>
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
              className="flex items-center justify-between rounded-xl border border-[var(--muted)] px-3 py-2.5 transition-all duration-200 hover:shadow-sm hover:border-[var(--foreground)]/15 hover:bg-[var(--card-hover)]/40"
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

function TrustScoreCard({ trustScore, trustScoreColor, trustScoreLabel, textClassMap, badgeClassMap }) {
  return (
    <motion.div variants={itemVariants} className="card overflow-hidden relative">
      <div className="flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-6">
          <CircularProgress value={trustScore} size={110} strokeWidth={9} color={trustScoreColor} />
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]/60 flex items-center gap-1">
              Trust Score
              <InfoTooltip text="Percentage of all-time verified emails classified as Safe (verified, deliverable, trusted, or probably valid)." />
            </p>
            <p className={`text-5xl font-bold mt-1 ${textClassMap[trustScoreColor]}`}>{trustScore}%</p>
            <div className="mt-2">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-md ${badgeClassMap[trustScoreColor]}`}>
                {trustScoreLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden md:flex relative h-28 w-40 items-center justify-center flex-shrink-0">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-[var(--primary)]/15 to-[var(--accent)]/15" />
          <ShieldCheck className="h-16 w-16 text-[var(--primary)]" strokeWidth={1.5} />
          <Star className="absolute top-2 right-6 h-5 w-5 text-warning fill-warning/30" />
          <Sparkles className="absolute bottom-3 left-4 h-5 w-5 text-[var(--accent)]" />
        </div>
      </div>
    </motion.div>
  );
}

function ActiveJobSection({ activeJob, navigate }) {
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
        <p className="text-[var(--foreground)]/50">Credits tracking not implemented</p>
      </div>

      <div className="card flex h-full items-center justify-center">
        <Button variant="success" size="lg" className="w-full" onClick={() => navigate('/verify')}>
          <Zap className="h-5 w-5 text-[var(--foreground)]" />
          Verify Email
        </Button>
      </div>
    </motion.div>
  );
}

function StatusBreakdownSection({
  trustScore,
  verifiedCount,
  totalEmails,
  generatedAt,
  lastSyncAt,
  flaggedOverview,
  domainSummary,
  perStatusCounts,
  bucketCounts,
  perStatusTrend,
  bucketTrendPct,
  flaggedCounts,
  worstDomains,
  dailyVolume,
  days,
  verificationSpeed,
  avgProcessingTimeMs,
  navigate,
}) {
  const dailyTotals = dailyVolume.map(dayTotal);
  const dailyAverage = dailyTotals.length > 0
    ? Math.round(dailyTotals.reduce((sum, v) => sum + v, 0) / dailyTotals.length)
    : 0;
  const peakDay = dailyTotals.length > 0 ? Math.max(...dailyTotals) : 0;

  const daysLabelMap = { 7: 'Last 7 Days', 30: 'Last 30 Days', 90: 'Last 90 Days', 365: 'All Time' };

  return (
    <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 items-start">
      <div className="card w-full rounded-3xl p-8 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-[var(--foreground)]">Status breakdown</h2>
            <p className="mt-2 text-sm text-[var(--foreground)]/60">Detailed breakdown of verification statuses (all-time)</p>

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
              {/*
                UI/UX FIX #3: the old "Last updated" row here (relativeTime
                of `generatedAt`, i.e. "when this API response was built")
                was redundant with the "Last Sync" stat card lower on this
                page (relativeTime of `lastSyncAt`, i.e. "when an email was
                actually last verified") — the two values are almost always
                within a second of each other and confused users about which
                one to trust. "Last Sync" is the meaningful one and stays.
                This slot now shows a genuinely different signal: whether
                the dashboard itself is actively auto-refreshing.
              */}
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success/10 dark:bg-success/20">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                  </span>
                </div>
                <div>
                  <p className="text-xs text-[var(--foreground)]/50">Dashboard status</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">Live — auto-refreshing</p>
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
              bucketTotal={bucketCounts.safe}
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
              bucketTotal={bucketCounts.risky}
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
              bucketTotal={bucketCounts.unsafe}
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
              bucketTotal={bucketCounts.processing}
              totalEmails={totalEmails}
              perStatusTrend={perStatusTrend}
              bucketTrendPct={bucketTrendPct}
            />
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border border-[var(--muted)] p-4">
            <p className="text-sm text-[var(--foreground)]/60">Total Emails</p>
            <p className="mt-2 text-3xl font-bold">{totalEmails.toLocaleString()}</p>
          </div>

          <div className="rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border border-[var(--muted)] p-4">
            <p className="text-sm text-[var(--foreground)]/60">Success Rate</p>
            <p className="mt-2 text-3xl font-bold text-success">{trustScore}%</p>
          </div>

          <div className="rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border border-[var(--muted)] p-4">
            <p className="text-sm text-[var(--foreground)]/60">Avg Response Time</p>
            <p className="mt-2 text-3xl font-bold">
              <span>{formatAvgTime(avgProcessingTimeMs)}</span>
            </p>
            <p className="text-xs text-[var(--foreground)]/50">Per email</p>
          </div>

          <div className="rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 border border-[var(--muted)] p-4">
            <p className="text-sm text-[var(--foreground)]/60 flex items-center gap-1">
              Last Sync
              <InfoTooltip text="Timestamp of the most recent email that actually finished verification (not just when this page refreshed)." />
            </p>
            <p className="mt-2 text-3xl font-bold">{relativeTime(lastSyncAt || generatedAt)}</p>
            <div className="flex items-center gap-1 text-xs text-[var(--foreground)]/50">
              <CalendarClock className="h-3 w-3" />
              Auto-refreshes periodically
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

          {/* FIX (audit #18): this selector only ever controlled the volume
              chart below, but nothing on the page said so — every other card
              (Trust Score, Safe/Risky/Unsafe totals, Status Breakdown) is
              always all-time. Label now makes the scope explicit instead of
              pretending to be a page-wide filter. */}
          <span className="rounded-xl border border-[var(--muted)] bg-[var(--background)] px-4 py-2 text-sm shadow-sm text-[var(--foreground)]/70">
            Chart period: {daysLabelMap[days] || `Last ${days} Days`}
          </span>
        </div>

        <div className="h-[430px] w-full">
          <StackedBarChart data={dailyVolume} height={430} />
        </div>

        <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10 dark:bg-success/20">
                <TrendingUp className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--foreground)]/60">Daily Average</p>
                <p className="mt-1 text-3xl font-bold">{dailyAverage.toLocaleString()}</p>
                <p className="text-xs text-[var(--foreground)]/50">emails/day</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 dark:bg-warning/20">
                <BarChart3 className="h-8 w-8 text-warning" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--foreground)]/60">Peak Day</p>
                <p className="mt-1 text-3xl font-bold">{peakDay.toLocaleString()}</p>
                <p className="text-xs text-[var(--foreground)]/50">highest volume</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 dark:bg-primary/20">
                <Database className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--foreground)]/60">Total Volume</p>
                <p className="mt-1 text-3xl font-bold">{totalEmails.toLocaleString()}</p>
                <p className="text-xs text-[var(--foreground)]/50">emails (all-time)</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
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
            <div className="flex items-center justify-between rounded-2xl bg-red-50 dark:bg-red-900/20 p-4 transition-all duration-200 hover:shadow-sm">
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

            <div className="flex items-center justify-between rounded-2xl bg-amber-50 dark:bg-amber-900/20 p-4 transition-all duration-200 hover:shadow-sm">
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

            <div className="flex items-center justify-between rounded-2xl bg-blue-50 dark:bg-blue-900/20 p-4 transition-all duration-200 hover:shadow-sm">
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

          <div className="mt-6 pt-6 border-t border-[var(--muted)]">
            <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Overview</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniStat
                label="Total Flagged"
                value={flaggedOverview.total_flagged.toLocaleString()}
                trend={flaggedOverview.total_flagged_trend_pct}
                windowLabel="vs yesterday"
                Icon={MailWarning}
                iconBg="bg-violet-100 dark:bg-violet-900/20"
                iconColor="text-violet-600"
              />
              <MiniStat
                label="High Priority"
                value={flaggedOverview.high_priority.toLocaleString()}
                trend={flaggedOverview.high_priority_trend_pct}
                windowLabel="vs yesterday"
                Icon={AlertTriangle}
                iconBg="bg-red-100 dark:bg-red-900/20"
                iconColor="text-red-600"
              />
              <MiniStat
                label="Flag Rate"
                value={`${flaggedOverview.flag_rate}%`}
                trend={flaggedOverview.flag_rate_trend_pct}
                windowLabel="vs yesterday"
                Icon={PieChart}
                iconBg="bg-amber-100 dark:bg-amber-900/20"
                iconColor="text-amber-600"
              />
              <MiniStat
                label="Last 7 Days"
                value={flaggedOverview.last_7_days.toLocaleString()}
                trend={flaggedOverview.last_7_days_trend_pct}
                windowLabel="vs prior 7 days"
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
                  className="flex items-center justify-between rounded-xl border border-[var(--muted)] p-4 transition-all duration-200 hover:shadow-sm hover:border-[var(--foreground)]/15"
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

          <div className="mt-6 pt-6 border-t border-[var(--muted)]">
            <p className="text-sm font-semibold text-[var(--foreground)] mb-4">Summary</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MiniStat
                label="Avg Reputation"
                value={`${domainSummary.avg_reputation}%`}
                trend={domainSummary.avg_reputation_trend_pct}
                windowLabel="vs prior period"
                Icon={ShieldCheck}
                iconBg="bg-violet-100 dark:bg-violet-900/20"
                iconColor="text-violet-600"
              />
              <MiniStat
                label="High Risk"
                value={domainSummary.high_risk_count}
                trend={domainSummary.high_risk_trend_pct}
                windowLabel="vs prior period"
                Icon={AlertTriangle}
                iconBg="bg-amber-100 dark:bg-amber-900/20"
                iconColor="text-amber-600"
              />
              <MiniStat
                label="Total Domains"
                value={domainSummary.total_domains}
                trend={domainSummary.total_domains_trend_pct}
                windowLabel="vs prior period"
                Icon={Globe}
                iconBg="bg-blue-100 dark:bg-blue-900/20"
                iconColor="text-[var(--foreground)]/60"
              />
              {/*
                UI/UX FIX #2 — "Improving" was an unlabeled raw number with
                zero context. Renamed to "Improving Domains" and added a
                tooltip that spells out exactly what it counts and over
                what window, matching what the backend actually computes
                in dashboard.py's _compute_domain_summary().
              */}
              <MiniStat
                label="Improving Domains"
                value={domainSummary.improving_count}
                trend={domainSummary.improving_trend_pct}
                windowLabel="vs prior 7 days"
                Icon={TrendingUp}
                iconBg="bg-success/10 dark:bg-success/20"
                iconColor="text-success"
                tooltip="Domains (with enough volume to measure) whose risk percentage has dropped by more than 2 points over the last 7 days compared to the 7 days before that — i.e. getting safer over time."
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
  const isTabVisible = useIsTabVisible();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard-stats', days],
    queryFn: () => getDashboardStats(days),
    refetchInterval: isTabVisible ? 10000 : false,
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
            <motion.div key={i} variants={itemVariants} className="card h-32 skeleton">
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
    total_emails_trend_pct: totalEmailsTrendPct = 0,
    verification_speed: verificationSpeed = 0,
    avg_processing_time_ms: avgProcessingTimeMs = 0,
    flagged_overview: flaggedOverview = { total_flagged: 0, high_priority: 0, flag_rate: 0, last_7_days: 0, total_flagged_trend_pct: 0, high_priority_trend_pct: 0, flag_rate_trend_pct: 0, last_7_days_trend_pct: 0 },
    domain_summary: domainSummary = { avg_reputation: 0, high_risk_count: 0, total_domains: 0, improving_count: 0, total_domains_trend_pct: 0, improving_trend_pct: 0 },
    generated_at: generatedAt = new Date().toISOString(),
    last_sync_at: lastSyncAt = null,
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

  const worstDomains = [...(topDomains || [])]
    .filter((d) => d.total >= 5)
    .sort((a, b) => b.risk_pct - a.risk_pct)
    .slice(0, 5);

  const sparkTotal = dailyVolume.map((d) => ({ v: dayTotal(d) }));
  const sparkSafe = dailyVolume.map((d) => ({ v: d.safe || 0 }));
  const sparkRisky = dailyVolume.map((d) => ({ v: d.risky || 0 }));
  const sparkUnsafe = dailyVolume.map((d) => ({ v: d.unsafe || 0 }));

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--foreground)]">Welcome back, {APP_USER.name.split(' ')[0]}! 👋</h1>
          <p className="text-sm text-[var(--foreground)]/60">Here's your email verification overview.</p>
        </div>
        <div>
          <label htmlFor="chart-period-select" className="sr-only">Chart period</label>
          <select
            id="chart-period-select"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-xl border border-[var(--muted)] bg-[var(--background)] px-4 py-2 text-sm shadow-sm text-[var(--foreground)] transition-colors duration-200 hover:border-[var(--foreground)]/20 cursor-pointer"
          >
            <option value={7}>Chart: Last 7 Days</option>
            <option value={30}>Chart: Last 30 Days</option>
            <option value={90}>Chart: Last 90 Days</option>
            <option value={365}>Chart: All Time</option>
          </select>
        </div>
      </motion.div>

      <TrustScoreCard
        trustScore={trustScore}
        trustScoreColor={trustScoreColor}
        trustScoreLabel={trustScoreLabel}
        textClassMap={textClassMap}
        badgeClassMap={badgeClassMap}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TopStatCard
          label="Total Emails"
          value={totalEmails}
          trendPct={totalEmailsTrendPct}
          sparkData={sparkTotal}
          color="#6366F1"
          Icon={Mail}
          iconBg="bg-indigo-100 dark:bg-indigo-900/20"
          iconColor="text-indigo-600"
        />
        <TopStatCard
          label="Safe"
          value={bucketCounts.safe || 0}
          trendPct={bucketTrendPct.safe ?? 0}
          sparkData={sparkSafe}
          color="#10B981"
          Icon={ShieldCheck}
          iconBg="bg-emerald-100 dark:bg-emerald-900/20"
          iconColor="text-emerald-600"
        />
        <TopStatCard
          label="Risky"
          value={bucketCounts.risky || 0}
          trendPct={bucketTrendPct.risky ?? 0}
          sparkData={sparkRisky}
          color="#F59E0B"
          Icon={AlertTriangle}
          iconBg="bg-amber-100 dark:bg-amber-900/20"
          iconColor="text-amber-600"
        />
        <TopStatCard
          label="Unsafe"
          value={bucketCounts.unsafe || 0}
          trendPct={bucketTrendPct.unsafe ?? 0}
          sparkData={sparkUnsafe}
          color="#EF4444"
          Icon={ShieldX}
          iconBg="bg-red-100 dark:bg-red-900/20"
          iconColor="text-red-600"
        />
      </div>

      <ActiveJobSection activeJob={activeJob} navigate={navigate} />

      <StatusBreakdownSection
        trustScore={trustScore}
        verifiedCount={verifiedCount}
        totalEmails={totalEmails}
        generatedAt={generatedAt}
        lastSyncAt={lastSyncAt}
        flaggedOverview={flaggedOverview}
        domainSummary={domainSummary}
        perStatusCounts={perStatusCounts}
        bucketCounts={bucketCounts}
        perStatusTrend={perStatusTrend}
        bucketTrendPct={bucketTrendPct}
        flaggedCounts={flaggedCounts}
        worstDomains={worstDomains}
        dailyVolume={dailyVolume}
        days={days}
        verificationSpeed={verificationSpeed}
        avgProcessingTimeMs={avgProcessingTimeMs}
        navigate={navigate}
      />
    </motion.div>
  );
}
