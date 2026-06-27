import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Globe, TrendingDown } from 'lucide-react'
import { listDomains } from '../services/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'

export default function DomainsPage() {
  const [page, setPage] = useState(1)

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ['domains', page],
    queryFn: () => listDomains({ page, size: 20 }),
    keepPreviousData: true,
  })

  const chartData = domains.slice(0, 10).map((d) => ({
    domain: d.domain,
    verified: d.verified_count,
    invalid: d.invalid_count,
    risky: d.risky_count,
  }))

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Domain Analytics</h1>
        <p className="text-slate-400 text-sm mt-1">Email distribution and health metrics per domain</p>
      </div>

      {/* Domain chart */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Top Domains — Status Breakdown</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="domain" tick={{ fill: '#64748b', fontSize: 10 }} angle={-30} textAnchor="end" />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
            <Bar dataKey="verified" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
            <Bar dataKey="invalid" stackId="a" fill="#ef4444" />
            <Bar dataKey="risky" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-left">
                {['Domain', 'Total', 'Verified', 'Invalid', 'Risky', 'Bounce Rate', 'MX Records'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-600">Loading…</td></tr>
              ) : domains.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-600">No domain data</td></tr>
              ) : domains.map((d) => (
                <tr key={d.domain} className="border-b border-slate-800/60 hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="text-slate-300 font-mono text-xs">{d.domain}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 tabular-nums">{d.total_emails.toLocaleString()}</td>
                  <td className="px-4 py-3 text-emerald-400 tabular-nums">{d.verified_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-red-400 tabular-nums">{d.invalid_count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-amber-400 tabular-nums">{d.risky_count.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <TrendingDown className={`w-3.5 h-3.5 ${d.bounce_rate > 20 ? 'text-red-400' : 'text-slate-500'}`} />
                      <span className={`tabular-nums ${d.bounce_rate > 20 ? 'text-red-400' : 'text-slate-400'}`}>
                        {d.bounce_rate.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {Array.isArray(d.mx_records) ? d.mx_records.slice(0, 2).join(', ') || '—' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
          <p className="text-xs text-slate-500">Page {page}</p>
          <div className="flex gap-2">
            <button className="btn-secondary text-xs py-1 px-3 disabled:opacity-40" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <button className="btn-secondary text-xs py-1 px-3 disabled:opacity-40" disabled={domains.length < 20} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  )
}
