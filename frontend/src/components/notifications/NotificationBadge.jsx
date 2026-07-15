// Small, presentational — no logic beyond formatting the count. Hidden
// entirely when count is 0 (per spec). `pulse` briefly plays a bounce
// animation when a new notification just arrived; `motion-safe:` means it's
// automatically skipped for users with prefers-reduced-motion set.
export default function NotificationBadge({ count = 0, pulse = false }) {
  if (!count || count <= 0) return null;

  const display = count > 99 ? '99+' : String(count);

  return (
    <span
      className={`absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-bold leading-none shadow-sm ring-2 ring-[var(--card)] ${
        pulse ? 'motion-safe:animate-bounce' : ''
      }`}
      aria-hidden="true"
    >
      {display}
    </span>
  );
}
