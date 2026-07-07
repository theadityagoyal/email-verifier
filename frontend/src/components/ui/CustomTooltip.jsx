export default function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;

  const total = payload.reduce(
    (sum, item) => sum + (Number(item.value) || 0),
    0
  );

  const colors = {
    Safe: '#10B981',
    Risky: '#F59E0B',
    Unsafe: '#EF4444',
    Processing: '#2563EB',
  };

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

          return (
            <div
              key={entry.name}
              className="flex items-center justify-between"
            >

              <div className="flex items-center gap-3">

                <span
                  className="h-3.5 w-3.5 rounded-full"
                  style={{
                    backgroundColor:
                      colors[entry.name] || entry.color,
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