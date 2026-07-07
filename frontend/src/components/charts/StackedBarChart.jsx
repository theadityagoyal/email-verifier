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

export default function StackedBarChart({
  data = [],
  height = 430,
}) {
  if (!data.length) {
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-[var(--muted)] bg-[var(--background)] text-sm text-[var(--foreground)]/50">
        No verification data available
      </div>
    );
  }

  const chartData = data.map((day) => ({
    ...day,
    label: new Date(day.date).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
    }),
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
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
            stroke="#CBD5E1"
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
            fill="#10B981"
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          <Bar
            dataKey="risky"
            stackId="emails"
            name="Risky"
            fill="#F59E0B"
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          <Bar
            dataKey="unsafe"
            stackId="emails"
            name="Unsafe"
            fill="#EF4444"
            radius={[0, 0, 0, 0]}
            isAnimationActive
            animationDuration={900}
            animationEasing="ease-out"
          />

          <Bar
            dataKey="processing"
            stackId="emails"
            name="Processing"
            fill="#2563EB"
            radius={[8, 8, 0, 0]}
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