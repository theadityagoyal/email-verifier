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

  if (chartData.length === 0) {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={[{ value: 1 }]}
            cx="50%"
            cy="50%"
            innerRadius="60%"
            outerRadius="80%"
            fill="var(--foreground) / 10"
            dataKey="value"
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
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
          }}
          labelStyle={{ fill: 'var(--foreground)' }}
          formatter={(value, name) => `${name}: ${value}`}
        />
        <Legend verticalAlign="top" height={36} wrapperStyle={{ justSelf: 'center' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}