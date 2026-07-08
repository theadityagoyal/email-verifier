import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTheme } from '@/styles/theme';

export default function TrendsChart({ data }) {
  const theme = useTheme();
  const isDark = document.documentElement.classList.contains('dark');

  // Data keys: verified, invalid, risky
  const series = [
    { key: 'verified', color: theme.success, name: 'Verified' },
    { key: 'invalid', color: theme.error, name: 'Invalid' },
    { key: 'risky', color: theme.warning, name: 'Risky' },
  ];

  // Handle empty data case
  if (!data || data.length === 0) {
    return (
      <ResponsiveContainer width="100%" height={350} aria-label="Trends chart - no data">
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="var(--muted)"
        >
          No trend data available
        </text>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={350} aria-label="Verification trends over time">
      <LineChart
        data={data}
        margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--foreground) / 10" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--foreground)', fontSize: 10 }}
        />
        <YAxis
          tick={{ fill: 'var(--foreground)', fontSize: 11 }}
        />
        <Tooltip
          containerStyle={{
            background: 'var(--background)',
            border: '1px solid var(--muted)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
          labelStyle={{ fill: 'var(--foreground)', fontSize: '0.875rem' }}
          formatter={(value, name) => [name, value]}
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
        {series.map(({ key, color, name }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
            name={name}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}