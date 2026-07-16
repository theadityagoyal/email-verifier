import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTheme } from '@/styles/theme';

export default function TrendsChart({ data }) {
  const theme = useTheme();

  const series = [
    { key: 'verified', color: theme.success, name: 'Verified' },
    { key: 'invalid', color: theme.error, name: 'Invalid' },
    { key: 'risky', color: theme.warning, name: 'Risky' },
  ];

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
        <CartesianGrid strokeDasharray="3 3" stroke={theme.border} opacity={0.6} />
        <XAxis
          dataKey="date"
          tick={{ fill: theme.foreground, fontSize: 10, opacity: 0.6 }}
        />
        <YAxis
          tick={{ fill: theme.foreground, fontSize: 11, opacity: 0.6 }}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: '8px 12px',
          }}
          labelStyle={{ color: 'var(--foreground)', fontSize: '0.875rem' }}
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
