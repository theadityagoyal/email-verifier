import { useTheme } from '@/styles/theme';

export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const theme = useTheme();
  const total = payload.reduce(
    (sum, item) => sum + (Number(item.value) || 0),
    0
  );

  return (
    <div className="min-w-[260px] rounded-2xl border border-[var(--muted)] bg-[var(--card)] p-5 shadow-2xl backdrop-blur-md">

      <div className="mb-4 border-b border-[var(--muted)] pb-3">

        <p className="text-xs uppercase tracking-widest text-[var(--foreground)]/50">
          Verification Summary
        </p>

        <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
          {label}
        </p>

      </div>

      <div className="space-y-3">

        {payload.map((entry) => {

          const value = Number(entry.value) || 0;

          const percent =
            total > 0
              ? ((value / total) * 100).toFixed(1)
              : '0.0';

          // Get color from theme based on entry.name, fallback to entry.color if provided
          let dotColor = entry.color;
          if (entry.name === 'Safe') dotColor = theme.success;
          else if (entry.name === 'Risky') dotColor = theme.warning;
          else if (entry.name === 'Unsafe') dotColor = theme.error;
          else if (entry.name === 'Processing') dotColor = theme.info;

          return (
            <div
              key={entry.name}
              className="flex items-center justify-between"
            >

              <div className="flex items-center gap-3">

                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{
                    backgroundColor: dotColor,
                  }}
                />

                <span className="font-medium text-[var(--foreground)]">
                  {entry.name}
                </span>

              </div>

              <div className="text-right">

                <p className="font-semibold text-[var(--foreground)]">
                  {value.toLocaleString()}
                </p>

                <p className="text-xs text-[var(--foreground)]/50">
                  {percent}%
                </p>

              </div>

            </div>
          );

        })}

      </div>

      <div className="mt-5 flex items-center justify-between border-t border-[var(--muted)] pt-4">

        <span className="text-sm font-semibold text-[var(--foreground)]/60">
          Total Emails
        </span>

        <span className="text-xl font-bold text-[var(--foreground)]">
          {total.toLocaleString()}
        </span>

      </div>

    </div>
  );
}