import { useEffect, useRef, useState } from 'react';

const NAMED_COLORS = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  info: 'var(--info)',
  primary: 'var(--primary)',
  muted: 'var(--muted)',
};

// Ease-out cubic — starts fast, settles gently. Matches the "premium,
// subtle" animation direction (Stripe/Vercel style) rather than a linear
// count which feels mechanical.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Score ring with a genuine count-up (0 -> value), driven by
 * requestAnimationFrame so the numeric label and the ring fill move in
 * perfect lockstep. Set `animate={false}` for an instant, non-animated
 * render (e.g. the empty state's static 0 ring).
 */
export default function ScoreRing({
  value,
  size = 130,
  strokeWidth = 10,
  color = 'success',
  label = 'Score',
  animate = true,
  durationMs = 900,
}) {
  const [display, setDisplay] = useState(animate ? 0 : value);
  const frameRef = useRef(null);

  useEffect(() => {
    if (!animate) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const from = 0;
    const to = value;

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animate]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (display / 100) * circumference;
  const ringColor = NAMED_COLORS[color] || color;

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      role="img"
      aria-label={`${label}: ${display} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${ringColor}55)` }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-bold text-[var(--foreground)] tabular-nums">{display}</div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--foreground)]/40 mt-0.5">/100</div>
      </div>
    </div>
  );
}
