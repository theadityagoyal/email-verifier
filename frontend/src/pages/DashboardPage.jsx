import { useQuery } from '@tanstack/react-query'
import { Mail, CheckCircle, XCircle, AlertTriangle, Clock, Activity } from 'lucide-react'
import StatCard from '../components/ui/StatCard'
import TrendsChart from '../components/charts/TrendsChart'
import StatusPieChart from '../components/charts/StatusPieChart'
import DomainBarChart from '../components/charts/DomainBarChart'
import { getDashboardStats, getTrends, listDomains } from '../services/api'

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
    refetchInterval: 10_000,
  })

  const { data: trends = [] } = useQuery({
    queryKey: ['trends'],
    queryFn: () => getTrends(30),
  })

  const { data: domainsData } = useQuery({
    queryKey: ['domains-top'],
    queryFn: () => listDomains({ page: 1, size: 10 }),
  })

  const domains = Array.isArray(domainsData) ? domainsData : []

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-1">Real-time email verification analytics</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard label="Total Emails" value={stats?.total_emails} icon={Mail} color="sky" />
        <StatCard label="Verified" value={stats?.verified} icon={CheckCircle} color="emerald"
          sub={`${stats?.success_rate ?? 0}% success`} />
        <StatCard label="Invalid" value={stats?.invalid} icon={XCircle} color="red" />
        <StatCard label="Risky" value={stats?.risky} icon={AlertTriangle} color="amber" />
        <StatCard label="Processing" value={stats?.processing} icon={Clock} color="violet" />
        <StatCard label="Queue Size" value={stats?.queue_size} icon={Activity} color="sky" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold text-white mb-4">Verification Trends (30d)</h2>
          {trends.length > 0 ? (
            <TrendsChart data={trends} />
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-600">
              No trend data yet
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-base font-semibold text-white mb-4">Status Distribution</h2>
          {stats ? (
            <StatusPieChart stats={stats} />
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-600">
              Loading...
            </div>
          )}
        </div>
      </div>

      {/* Top domains */}
      <div className="card">
        <h2 className="text-base font-semibold text-white mb-4">Top Domains</h2>
        {domains.length > 0 ? (
          <DomainBarChart data={domains.slice(0, 10)} />
        ) : (
          <div className="h-64 flex items-center justify-center text-slate-600">
            No domain data yet
          </div>
        )}
      </div>
    </div>
  )
}
