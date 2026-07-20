import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, LineChart, Line } from 'recharts';
import Button from '@/components/ui/Button';

export default function DomainAnalytics({
  overview,
  topRiskDomains = [],
  dailyRiskTrend = [],
  overallTrendDelta = null,
  newDomainsSparkline = [],
  newDomainsPct = 0,
  navigate,
}) {
  return (
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
          {topRiskDomains.length === 0 ? (
            <p className="text-sm text-[var(--foreground)]/40">No data yet</p>
          ) : (
            topRiskDomains.map((d) => (
              <div
                key={d.domain}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--muted)] px-3 py-2.5 cursor-pointer hover:bg-[var(--muted)]/30 transition-colors"
                onClick={() => navigate?.(`/emails?domain=${encodeURIComponent(d.domain)}`)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldAlert className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="text-sm font-medium text-[var(--foreground)] truncate">{d.domain}</span>
                </div>
                <span className="shrink-0 rounded-full bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {d.risk_percent}%
                </span>
              </div>
            ))
          )}
        </div>
        <button
          onClick={() => navigate?.('/domains?sort=risk')}
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
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${overallTrendDelta > 0
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
          onClick={() => navigate?.('/domains?sort=newest')}
        >
          View new domains
        </Button>
      </div>
    </motion.div>
  );
}
