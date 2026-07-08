import { useEffect, useState } from 'react';
import { useTheme } from '@/styles/theme';

export default function CircularProgress({
  value,
  size = 120,
  strokeWidth = 10,
  color = 'success',
  label = 'Trust',
}) {
  const theme = useTheme();
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setPercent(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  // Get color from theme, fallback to the raw color value if not a predefined theme color
  const progressColor = color in theme ? theme[color] : color;

  // Background color from theme's muted
  const backgroundColor = theme.muted;

  return (
    <div
      className="relative flex items-center justify-center"
      role="img"
      aria-label={`Progress: ${percent}% ${label}`}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90"
      >
        <title>Progress: {percent}% {label}</title>
        {/* Background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />

        {/* Progress */}
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
          style={{
            transition:
              'stroke-dashoffset .9s cubic-bezier(.4,0,.2,1)',
          }}
        />
      </svg>

      <div className="absolute text-center">
        <div className="text-3xl font-bold text-[var(--foreground)]">
          {percent}%
        </div>

        <div className="mt-1 text-xs uppercase tracking-wider text-[var(--foreground)]/50">
          {label}
        </div>
      </div>
    </div>
  );
}