import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

import CustomTooltip from '../ui/CustomTooltip';
import { useTheme } from '@/styles/theme';
import { Inbox } from 'lucide-react';

export default function StackedBarChart({
  data = [],
  height = 430,
}) {
  const theme = useTheme();

  if (!data.length) {
    return (
      <div
        className="flex h-full min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground-muted)]"
        aria-label="No verification data available"
      >
        <Inbox className="h-10 w-10 text-[var(--foreground-muted)]/50" />
        No verification data available
      </div>
    );
  }

  const chartData = data
    .filter((day) => day?.date)
    .map((day) => ({
      ...day,
      label: new Date(day.date).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
      }),
    }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height} aria-label="Email verification status over time">
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 20, left: 10, bottom: 10 }}
          barGap={4}
          barCategoryGap="32%"
          maxBarSize={30}
        >
          <defs>
            <linearGradient id="fillSafe" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.success} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.success} stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="fillRisky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.warning} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.warning} stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="fillUnsafe" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.error} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.error} stopOpacity={0.75} />
            </linearGradient>
            <linearGradient id="fillProcessing" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.info} stopOpacity={1} />
              <stop offset="100%" stopColor={theme.info} stopOpacity={0.75} />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            stroke={theme.border}
            strokeDasharray="4 4"
            opacity={0.5}
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: theme.foreground, opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: theme.foreground, opacity: 0.6 }}
            tickLine={false}
            axisLine={false}
          />

          <Tooltip
            cursor={{ fill: `${theme.primary}14` }}
            content={<CustomTooltip />}
          />

          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={9}
            wrapperStyle={{ paddingBottom: 20, fontSize: 13, fontWeight: 600 }}
          />

          <Bar
            dataKey="safe"
            stackId="emails"
            name="Safe"
            fill="url(#fillSafe)"
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="risky"
            stackId="emails"
            name="Risky"
            fill="url(#fillRisky)"
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="unsafe"
            stackId="emails"
            name="Unsafe"
            fill="url(#fillUnsafe)"
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
          <Bar
            dataKey="processing"
            stackId="emails"
            name="Processing"
            fill="url(#fillProcessing)"
            radius={[6, 6, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-5 text-center text-xs text-[var(--foreground-muted)]">
        Data shown in Asia/Kolkata (IST) timezone
      </div>
    </div>
  );
}
