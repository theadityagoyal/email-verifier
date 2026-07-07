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
} from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

// Plain string keys — matches per_status_counts object keys returned by
// /dashboard/stats exactly. Avoids relying on an EmailStatus.value shape
// that may not exist on the frontend model.
const SAFE_STATUSES = ['verified', 'deliverable', 'trusted', 'probably_valid'];
const RISKY_STATUSES = ['risky', 'unconfirmed', 'uncertain'];
const UNSAFE_STATUSES = ['invalid', 'undeliverable'];

const GROUP_STYLES = {
  Safe: { title: 'text-success', dot: 'bg-success' },
  Risky: { title: 'text-warning', dot: 'bg-warning' },
  Unsafe: { title: 'text-error', dot: 'bg-error' },
  Processing: {title: 'text-blue-600',dot: 'bg-blue-500',},
};

function StatusGroup({ title, statuses, perStatusCounts, totalEmails }) {
  const rows = statuses
    .filter((s) => title === "Processing" || (perStatusCounts[s] || 0) > 0)
    .sort((a, b) => (perStatusCounts[b] || 0) - (perStatusCounts[a] || 0));

  const total = rows.reduce(
    (sum, status) => sum + (perStatusCounts[status] || 0),
    0
  );

  const percent =
    totalEmails > 0
      ? ((total / totalEmails) * 100).toFixed(1)
      : '0.0';

  const config = {
    Safe: {
      color: 'text-emerald-600',
      bg: 'bg-emerald-100 dark:bg-emerald-900/20',
      dot: 'bg-emerald-500',
      badge: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
      Icon: ShieldCheck,
    },

    Risky: {
      color: 'text-amber-500',
      bg: 'bg-amber-100 dark:bg-amber-900/20',
      dot: 'bg-amber-500',
      badge: 'bg-amber-100 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400',
      Icon: AlertTriangle,
    },

    Unsafe: {
      color: 'text-red-500',
      bg: 'bg-red-100 dark:bg-red-900/20',
      dot: 'bg-red-500',
      badge: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400',
      Icon: ShieldX,
    },

    Processing: {
      color: 'text-blue-500',
      bg: 'bg-blue-100 dark:bg-blue-900/20',
      dot: 'bg-blue-500',
      badge: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
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
    <div className="py-5">

      <div className="flex items-start justify-between">

        <div className="flex items-center gap-4">

          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${item.bg}`}
          >
            <Icon className={`h-6 w-6 ${item.color}`} />
          </div>

          <div>

            <h3 className={`text-2xl font-semibold ${item.color}`}>
              {title}
            </h3>

          </div>

        </div>

        <div className="text-right">

          <p className={`text-4xl font-bold ${item.color}`}>
            {total.toLocaleString()}
          </p>

          <span
            className={`mt-2 inline-block rounded-full px-3 py-1 text-sm font-medium ${item.badge}`}
          >
            {percent}%
          </span>

        </div>

      </div>

      <div className="mt-6 space-y-3">

        {rows.map((status) => {
          const count = perStatusCounts[status] || 0;

          const pct =
            totalEmails > 0
              ? ((count / totalEmails) * 100).toFixed(1)
              : '0.0';

          const RowIcon = statusIcons[status] || HelpCircle;

          return (
            <div
              key={status}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bg}`}
                >
                  <RowIcon className={`h-5 w-5 ${item.color}`} />
                </div>

                <span className="text-base text-[var(--foreground)] capitalize">
                  {status.replace(/_/g, ' ')}
                </span>
              </div>

              <span className="text-base text-[var(--foreground)]/70 tabular-nums">
                {count.toLocaleString()} ({pct}%)
              </span>
            </div>
          );
        })}

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
  } = stats;

  const trustScoreColor = trustScore >= 60 ? 'success' : trustScore >= 40 ? 'warning' : 'error';
  const trustScoreLabel = trustScore >= 60 ? 'safe to send' : 'needs review';
  // Static class map — Tailwind JIT can't see template-literal class names
  // like `bg-${x}/15`, so every combination must appear literally somewhere.
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

  // "Worst domains" — sorted by risk_pct (unsafe + risky share), min 5 emails
  // to avoid a 1-email domain showing 100% and skewing the list.
  const worstDomains = [...(topDomains || [])]
    .filter((d) => d.total >= 5)
    .sort((a, b) => b.risk_pct - a.risk_pct)
    .slice(0, 5);

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariants} className="space-y-6">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="text-sm text-[var(--foreground)]/60">Overview of your email verification activity</p>
      </motion.div>

      {/* Trust Score Card (hero, full width) */}
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

      {/* Action strip (3 columns) */}
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

        {/* Remove this card if credits/usage tracking isn't part of your product */}
        <div className="card flex h-full items-center justify-center">
          <p className="text-sm text-[var(--foreground)]/50">Credits tracking not implemented</p>
        </div>

        <div className="card flex h-full items-center justify-center">
            <Button
              variant="success"
              size="lg"
              className="w-full"
              onClick={() => navigate('/verify')}
            >
              <Zap className="h-5 w-5" />
              Verify Email
            </Button>
          </div>
      </motion.div>

      {/* Status breakdown + Verification volume */}
      <motion.div
        variants={itemVariants}
        className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start"
      >
       <div className="card xl:col-span-4 h-full">

  <h2 className="text-2xl font-bold text-[var(--foreground)]">
    Status breakdown
  </h2>

  <p className="mt-2 mb-8 text-sm text-[var(--foreground)]/60">
    Detailed breakdown of verification statuses
  </p>

  <StatusGroup
    title="Safe"
    statuses={SAFE_STATUSES}
    perStatusCounts={perStatusCounts}
    totalEmails={totalEmails}
  />

  <div className="my-6 h-px bg-[var(--muted)]" />

  <StatusGroup
    title="Risky"
    statuses={RISKY_STATUSES}
    perStatusCounts={perStatusCounts}
    totalEmails={totalEmails}
  />

  <div className="my-6 h-px bg-[var(--muted)]" />

  <StatusGroup
    title="Unsafe"
    statuses={UNSAFE_STATUSES}
    perStatusCounts={perStatusCounts}
    totalEmails={totalEmails}
  />

  <div className="my-6 h-px bg-[var(--muted)]" />

  <StatusGroup
    title="Processing"
    statuses={['processing']}
    perStatusCounts={perStatusCounts}
    totalEmails={totalEmails}
  />

  <div className="mt-8 grid grid-cols-2 gap-4">

    <div className="rounded-2xl border border-[var(--muted)] p-4">

      <p className="text-sm text-[var(--foreground)]/60">
        Total Emails
      </p>

      <p className="mt-2 text-3xl font-bold">
        {totalEmails.toLocaleString()}
      </p>

    </div>

    <div className="rounded-2xl border border-[var(--muted)] p-4">

      <p className="text-sm text-[var(--foreground)]/60">
        Success Rate
      </p>

      <p className="mt-2 text-3xl font-bold text-emerald-600">
        {trustScore}%
      </p>

    </div>

  </div>

</div>

        <div className="card xl:col-span-8 min-h-[760px]">

          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">
                Verification Volume
              </h2>

              <p className="mt-1 text-sm text-[var(--foreground)]/60">
                Daily email verification activity
              </p>
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

          <StackedBarChart
            data={dailyVolume}
            height={430}
          />

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-5">

            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 dark:bg-emerald-900/20">
                  <TrendingUp className="h-8 w-8 text-emerald-600" />
                </div>

                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">
                    Daily Average
                  </p>

                  <p className="mt-1 text-3xl font-bold">
                    {dailyVolume.length
                      ? Math.round(
                          dailyVolume.reduce(
                            (sum, d) =>
                              sum +
                              (d.safe || 0) +
                              (d.risky || 0) +
                              (d.unsafe || 0) +
                              (d.processing || 0),
                            0
                          ) / dailyVolume.length
                        ).toLocaleString()
                      : 0}
                  </p>

                  <p className="text-xs text-[var(--foreground)]/50">
                    emails/day
                  </p>
                </div>

              </div>
            </div>

            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">

                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-900/20">
                  <BarChart3 className="h-8 w-8 text-amber-600" />
                </div>

                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">
                    Peak Day
                  </p>

                  <p className="mt-1 text-3xl font-bold">
                    {dailyVolume.length
                      ? Math.max(
                          ...dailyVolume.map(
                            d =>
                              (d.safe || 0) +
                              (d.risky || 0) +
                              (d.unsafe || 0) +
                              (d.processing || 0)
                          )
                        ).toLocaleString()
                      : 0}
                  </p>

                  <p className="text-xs text-[var(--foreground)]/50">
                    highest volume
                  </p>
                </div>

              </div>
            </div>
            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 dark:bg-blue-900/20">
                  <Database className="h-8 w-8 text-blue-600" />
                </div>

                <div>
                  <p className="text-xs font-medium text-[var(--foreground)]/60">
                    Total Volume
                  </p>

                  <p className="mt-1 text-3xl font-bold">
                    {totalEmails.toLocaleString()}
                  </p>

                  <p className="text-xs text-[var(--foreground)]/50">
                    emails
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-sm">
                <div className="flex items-center gap-4">

                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 dark:bg-violet-900/20">
                    <PieChart className="h-8 w-8 text-violet-600" />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-[var(--foreground)]/60">
                      Success Rate
                    </p>

                    <p className="mt-1 text-3xl font-bold text-emerald-600">
                      {trustScore}%
                    </p>

                    <p className="text-xs text-[var(--foreground)]/50">
                      overall accuracy
                    </p>
                  </div>

                </div>
              </div>

              {/* Close analytics grid */}
            </div>

              {/* Close Verification Volume card */}
          </div>

              {/* Close Status + Verification layout */}
          </motion.div>

      {/* Flagged emails + Worst domains */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card h-full">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">
                Flagged Emails
              </h2>

              <p className="mt-1 text-sm text-[var(--foreground)]/60">
                Emails requiring manual review
              </p>
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
                  <p className="text-sm text-[var(--foreground)]/60">
                    Temporary email providers
                  </p>
                </div>

              </div>

              <p className="text-3xl font-bold text-red-600">
                {(flaggedCounts.disposable || 0).toLocaleString()}
              </p>

            </div>

            <div className="flex items-center justify-between rounded-2xl bg-amber-50 dark:bg-amber-900/20 p-4">

              <div className="flex items-center gap-4">

                <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-3">
                  <Users className="h-6 w-6 text-amber-600" />
                </div>

                <div>
                  <p className="font-semibold">Role Based</p>
                  <p className="text-sm text-[var(--foreground)]/60">
                    Shared business inboxes
                  </p>
                </div>

              </div>

              <p className="text-3xl font-bold text-amber-600">
                {(flaggedCounts.role_based || 0).toLocaleString()}
              </p>

            </div>

            <div className="flex items-center justify-between rounded-2xl bg-blue-50 dark:bg-blue-900/20 p-4">

              <div className="flex items-center gap-4">

                <div className="rounded-xl bg-blue-100 dark:bg-blue-900/30 p-3">
                  <ShieldAlert className="h-6 w-6 text-blue-600" />
                </div>

                <div>
                  <p className="font-semibold">Catch All</p>
                  <p className="text-sm text-[var(--foreground)]/60">
                    Accepts every email
                  </p>
                </div>

              </div>

              <p className="text-3xl font-bold text-blue-600">
                {(flaggedCounts.catch_all || 0).toLocaleString()}
              </p>

            </div>

          </div>
        </div>

        <div className="card h-full">

          <div className="mb-6 flex items-center justify-between">

            <div>

              <h2 className="text-2xl font-bold">
                Worst Domains
              </h2>

              <p className="text-sm text-[var(--foreground)]/60">
                Highest risk domains detected
              </p>

            </div>

            <Globe className="h-8 w-8 text-blue-600" />

          </div>

          {worstDomains.length === 0 ? (

            <div className="py-10 text-center text-[var(--foreground)]/50">
              No risky domains found
            </div>

          ) : (

            <div className="space-y-3">

              {worstDomains.map((d) => (

                <div
                  key={d.domain}
                  className="flex items-center justify-between rounded-xl border border-[var(--muted)] p-4"
                >

                  <div>

                    <p className="font-semibold">
                      {d.domain}
                    </p>

                    <p className="text-xs text-[var(--foreground)]/50">
                      Domain Reputation
                    </p>

                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                      d.risk_pct >= 50
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
