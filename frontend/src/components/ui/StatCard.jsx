import clsx from 'clsx'

export default function StatCard({ label, value, icon: Icon, color = 'sky', sub }) {
  const colors = {
    sky: 'text-sky-400 bg-sky-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    red: 'text-red-400 bg-red-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    violet: 'text-violet-400 bg-violet-500/10',
  }

  return (
    <div className="card flex items-start gap-4">
      <div className={clsx('p-2.5 rounded-lg', colors[color])}>
        <Icon className={clsx('w-5 h-5', colors[color].split(' ')[0])} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-400 truncate">{label}</p>
        <p className="text-2xl font-bold text-white mt-0.5 tabular-nums">
          {typeof value === 'number' ? value.toLocaleString() : value ?? '—'}
        </p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  )
}
