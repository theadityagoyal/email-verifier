export default function StatCard({
  label,
  value,
  icon: Icon,
  color = 'gray',
  sub,
  trend,
}) {
  const colors = {
    safe: {
      bg: 'from-emerald-500 to-green-600',
      light: 'bg-emerald-50 dark:bg-emerald-900/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-200 dark:border-emerald-800',
    },
    risky: {
      bg: 'from-amber-500 to-orange-500',
      light: 'bg-amber-50 dark:bg-amber-900/20',
      text: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-200 dark:border-amber-800',
    },
    unsafe: {
      bg: 'from-red-500 to-rose-600',
      light: 'bg-red-50 dark:bg-red-900/20',
      text: 'text-red-600 dark:text-red-400',
      border: 'border-red-200 dark:border-red-800',
    },
    processing: {
      bg: 'from-sky-500 to-blue-600',
      light: 'bg-sky-50 dark:bg-sky-900/20',
      text: 'text-sky-600 dark:text-sky-400',
      border: 'border-sky-200 dark:border-sky-800',
    },
    primary: {
      bg: 'from-indigo-500 to-violet-600',
      light: 'bg-indigo-50 dark:bg-indigo-900/20',
      text: 'text-indigo-600 dark:text-indigo-400',
      border: 'border-indigo-200 dark:border-indigo-800',
    },
    gray: {
      bg: 'from-slate-500 to-slate-600',
      light: 'bg-slate-50 dark:bg-slate-900/20',
      text: 'text-slate-600 dark:text-slate-400',
      border: 'border-slate-200 dark:border-slate-700',
    },
  };

  const theme = colors[color] || colors.gray;

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">

      {/* Top Gradient */}
      <div
        className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${theme.bg}`}
      />

      {/* Background Glow */}
      <div
        className={`absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-10 blur-3xl bg-gradient-to-br ${theme.bg}`}
      />

      <div className="relative flex items-start justify-between">

        <div className="flex flex-col">

          <span className="text-sm font-medium text-[var(--foreground)]/60">
            {label}
          </span>

          <h2 className="mt-3 text-4xl font-bold tracking-tight text-[var(--foreground)] tabular-nums">
            {typeof value === 'number'
              ? value.toLocaleString()
              : value ?? '—'}
          </h2>

          {sub && (
            <p className="mt-2 text-sm text-[var(--foreground)]/50">
              {sub}
            </p>
          )}

          {trend && (
            <span
              className={`mt-4 inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${theme.light} ${theme.text} ${theme.border}`}
            >
              {trend}
            </span>
          )}

        </div>

        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.bg} text-white shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:rotate-6`}
        >
          {Icon && <Icon size={30} strokeWidth={2.2} />}
        </div>

      </div>

    </div>
  );
}