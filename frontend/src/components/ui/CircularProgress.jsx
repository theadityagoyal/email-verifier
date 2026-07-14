import { useEffect, useState } from 'react';

// FIX (audit #39): previously `progressColor = color in theme ? theme[color] : color`
// only worked when the caller passed a theme key like 'success' (DashboardPage
// does this), but was dead logic when a caller passed a raw CSS var string
// like 'var(--success)' (VerifyEmailPage does this) since that string is
// never a key of the theme object — it just fell through to `color` either
// way, working by accident rather than by a real contract.
//
// Fixed contract: `color` may be either one of the named keys below, or any
// valid CSS color value (e.g. 'var(--success)', '#10B981'). Named keys are
// resolved to the matching CSS variable; anything else passes through as-is.
const NAMED_COLORS = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
  info: 'var(--info)',
  primary: 'var(--primary)',
  accent: 'var(--accent)',
  muted: 'var(--muted)',
};

export default function CircularProgress({
  value,
  size = 120,
  strokeWidth = 10,
  color = 'success',
  label = 'Trust',
}) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setPercent(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  const progressColor = NAMED_COLORS[color] || color;
  const backgroundColor = 'var(--muted)';

  return (
    <div
      className="relative flex items-center justify-center"
      role="img"
      aria-label={`Progress: ${percent}% ${label}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <title>Progress: {percent}% {label}</title>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>

      <div className="absolute text-center">
        <div className="text-3xl font-bold text-[var(--foreground)]">{percent}%</div>
        <div className="mt-1 text-xs uppercase tracking-wider text-[var(--foreground)]/50">{label}</div>
      </div>
    </div>
  );
}
