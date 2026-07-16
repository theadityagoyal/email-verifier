import { useTheme } from '@/styles/theme';

export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const theme = useTheme();
  const total = payload.reduce(
    (sum, item) => sum + (Number(item.value) || 0),
    0
  );

  return (
    <div className="min-w-[260px] rounded-2xl border border-[var(--border)] bg-[var(--card)]/95 p-5 shadow-2xl backdrop-blur-xl animate-fade-in">

      <div className="mb-4 border-b border-[var(--border)] pb-3">
        <p className="text-xs uppercase tracking-widest text-[var(--foreground-muted)]">
          Verification Summary
        </p>
        <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
          {label}
        </p>
      </div>

      <div className="space-y-3">
        {payload.map((entry) => {
          const value = Number(entry.value) || 0;
          const percent = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

          let dotColor = entry.color;
          if (entry.name === 'Safe') dotColor = theme.success;
          else if (entry.name === 'Risky') dotColor = theme.warning;
          else if (entry.name === 'Unsafe') dotColor = theme.error;
          else if (entry.name === 'Processing') dotColor = theme.info;

          return (
            <div key={entry.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="h-3 w-3 rounded-full ring-4"
                  style={{
                    backgroundColor: dotColor,
                    boxShadow: `0 0 0 4px ${dotColor}22`,
                  }}
                />
                <span className="font-medium text-[var(--foreground)]">
                  {entry.name}
                </span>
              </div>

              <div className="text-right">
                <p className="font-semibold text-[var(--foreground)] tabular-nums">
                  {value.toLocaleString()}
                </p>
                <p className="text-xs text-[var(--foreground-muted)] tabular-nums">
                  {percent}%
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[var(--border)] pt-4">
        <span className="text-sm font-semibold text-[var(--foreground-secondary)]">
          Total Emails
        </span>
        <span className="text-xl font-bold text-[var(--foreground)] tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
