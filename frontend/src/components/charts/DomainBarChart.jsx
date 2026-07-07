import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from '@/styles/theme';

export default function DomainBarChart({ data }) {
  const theme = useTheme();

  // NOTE: top_domains items are flat — { domain, safe, risky, unsafe, processing,
  // total, risk_pct } — matching the /dashboard/stats response. No bucket_counts nesting.
  const chartData = data.map((d) => ({
    domain: d.domain,
    verified: d.safe || 0,
    invalid: d.unsafe || 0,
    risky: d.risky || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
        <XAxis dataKey="domain" tick={{ fill: 'var(--foreground)', fontSize: 10 }} />
        <YAxis tick={{ fill: 'var(--foreground)', fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            background: 'var(--background)',
            border: '1px solid var(--muted)',
            borderRadius: 8,
          }}
          labelStyle={{ color: 'var(--foreground)' }}
          formatter={(value, name) => [value, name]}
        />
        <Legend verticalAlign="top" height={36} wrapperStyle={{ display: 'flex', justifyContent: 'center' }} />
        <Bar dataKey="verified" fill={theme.success} radius={[4, 4, 0, 0]} />
        <Bar dataKey="invalid" fill={theme.error} radius={[4, 4, 0, 0]} />
        <Bar dataKey="risky" fill={theme.warning} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
