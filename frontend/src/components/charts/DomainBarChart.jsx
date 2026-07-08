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

  // Handle empty data case
  if (!data || data.length === 0) {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="var(--muted)"
        >
          No domain data available
        </text>
      </ResponsiveContainer>
    );
  }

  // NOTE: top_domains items are flat — { domain, safe, risky, unsafe, processing,
  // total, risk_pct } — matching the /dashboard/stats response. No bucket_counts nesting.
  const chartData = data.map((d) => ({
    domain: d.domain || 'Unknown',
    verified: Number(d.safe) || 0,
    invalid: Number(d.unsafe) || 0,
    risky: Number(d.risky) || 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={260} aria-label="Domain verification chart">
      <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--muted)" />
        <XAxis dataKey="domain" tick={{ fill: 'var(--foreground)', fontSize: 10 }} />
        <YAxis tick={{ fill: 'var(--foreground)', fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            background: 'var(--background)',
            border: '1px solid var(--muted)',
            borderRadius: 8,
            padding: '8px 12px',
          }}
          labelStyle={{ color: 'var(--foreground)', fontSize: '0.875rem' }}
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
        <Bar dataKey="verified" fill={theme.success} radius={4} />
        <Bar dataKey="invalid" fill={theme.error} radius={4} />
        <Bar dataKey="risky" fill={theme.warning} radius={4} />
      </BarChart>
    </ResponsiveContainer>
  );
}
