import { useEffect, useRef, useState } from 'react';

// Same easing/rAF pattern already used by ScoreRing.jsx elsewhere in the
// app, reused here for consistency rather than reinventing a new approach.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedCounter({ value = 0, durationMs = 700, className = '' }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);
  const prevValueRef = useRef(0);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = Number(value) || 0;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeOutCubic(t);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevValueRef.current = to;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
