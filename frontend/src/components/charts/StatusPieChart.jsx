import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const COLORS = { verified: '#10b981', invalid: '#ef4444', risky: '#f59e0b', processing: '#0ea5e9' }

export default function StatusPieChart({ stats }) {
  if (!stats) return null

  const data = [
    { name: 'Verified', value: stats.verified },
    { name: 'Invalid', value: stats.invalid },
    { name: 'Risky', value: stats.risky },
    { name: 'Processing', value: stats.processing },
  ].filter(d => d.value > 0)

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={COLORS[entry.name.toLowerCase()] || '#64748b'} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
          labelStyle={{ color: '#94a3b8' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
