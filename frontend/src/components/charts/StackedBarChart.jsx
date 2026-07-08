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

export default function StackedBarChart({
  data = [],
  height = 430,
}) {
  const theme = useTheme();

  if (!data.length) {
    return (
      <div
        className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-[var(--muted)] bg-[var(--background)] text-sm text-[var(--foreground)]/50"
        aria-label="No verification data available"
      >
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
          margin={{
            top: 20,
            right: 20,
            left: 10,
            bottom: 10,
          }}
          barGap={0}
          barCategoryGap="35%"
          maxBarSize={32}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--muted)"
            strokeDasharray="4 4"
            opacity={0.35}
          />

          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />

          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
          />

          <Tooltip
            cursor={{
              fill: 'rgba(99,102,241,.08)',
            }}
            content={<CustomTooltip />}
          />

          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={10}
            wrapperStyle={{
              paddingBottom: 20,
              fontSize: 13,
              fontWeight: 600,
            }}
          />

          <Bar
            dataKey="safe"
            stackId="emails"
            name="Safe"
            fill={theme.success}
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          <Bar
            dataKey="risky"
            stackId="emails"
            name="Risky"
            fill={theme.warning}
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          <Bar
            dataKey="unsafe"
            stackId="emails"
            name="Unsafe"
            fill={theme.error}
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          <Bar
            dataKey="processing"
            stackId="emails"
            name="Processing"
            fill={theme.info}
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-5 text-center text-xs text-[var(--foreground)]/50">
        Data shown in Asia/Kolkata (IST) timezone
      </div>
    </div>
  );
}