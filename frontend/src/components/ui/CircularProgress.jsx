import { useEffect, useState } from 'react';

export default function CircularProgress({
  value,
  size = 120,
  strokeWidth = 10,
  color = 'success',
}) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setPercent(value), 150);
    return () => clearTimeout(timer);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  const colors = {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  };

  const progressColor = colors[color] || color;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width={size}
        height={size}
        className="-rotate-90"
      >
        {/* Background */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5E7EB"
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
          Trust
        </div>
      </div>
    </div>
  );
}