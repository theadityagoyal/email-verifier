import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTheme } from '@/styles/theme';

export default function TrendsChart({ data }) {
  const theme = useTheme();
  const isDark = document.documentElement.classList.contains('dark');

  // Data keys: verified, invalid, risky
  const series = [
    { key: 'verified', color: theme.success },
    { key: 'invalid', color: theme.error },
    { key: 'risky', color: theme.warning },
  ];

  return (
    <ResponsiveContainer width="100%" height={350}>
      <LineChart
        data={data}
        margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--foreground) / 10" />
        <XAxis dataKey="date" tick={{ fill: 'var(--foreground)', fontSize: 10 }} />
        <YAxis tick={{ fill: 'var(--foreground)', fontSize: 11 }} />
        <Tooltip
          containerStyle={{
            background: 'var(--background)',
            border: '1px solid var(--muted)',
            borderRadius: 8,
          }}
          labelStyle={{ fill: 'var(--foreground)' }}
          formatter={(value) => `${value}`}
        />
        <Legend verticalAlign="top" height={36} wrapperStyle={{ justSelf: 'center' }} />
        {series.map(({ key, color }) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}