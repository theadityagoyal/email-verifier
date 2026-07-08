import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/styles/theme';

export default function StatusPieChart({ stats, data }) {
  const theme = useTheme();
  const isDark = document.documentElement.classList.contains('dark');

  // Support both formats: stats object or data array
  const chartData = data || (stats ? [
    { name: 'Verified', value: stats.verified, fill: theme.success },
    { name: 'Invalid', value: stats.invalid, fill: theme.error },
    { name: 'Risky', value: stats.risky, fill: theme.warning },
    { name: 'Processing', value: stats.processing, fill: theme.info },
  ].filter(d => d.value > 0) : []);

  // Handle empty data case
  if (chartData.length === 0) {
    return (
      <ResponsiveContainer width="100%" height={260} aria-label="Status distribution chart - no data">
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="var(--muted)"
        >
          No status data available
        </text>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260} aria-label="Status distribution chart">
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={false}
          innerRadius="60%"
          outerRadius="80%"
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          containerStyle={{
            background: 'var(--background)',
            border: '1px solid var(--muted)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
          labelStyle={{ fill: 'var(--foreground)', fontSize: '0.875rem' }}
          formatter={(value, name) => `${name}: ${value}`}
        />
        <Legend
          verticalAlign="top"
          height={36}
          wrapperStyle={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '-10px'
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}