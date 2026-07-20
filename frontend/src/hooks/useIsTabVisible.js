import { useState, useEffect } from 'react';

/**
 * Single source of truth for "is this browser tab currently visible".
 *
 * Used to gate TanStack Query `refetchInterval` so background/inactive tabs
 * don't keep polling the backend every few seconds for no reason.
 *
 * Previously this exact hook lived only inside DashboardPage.jsx as a local
 * function. It's extracted here so EmailListPage.jsx and DomainsPage.jsx can
 * share the identical behavior instead of each either duplicating it or (as
 * was actually the case before this fix) not polling at all — which is why
 * Dashboard auto-refreshed live but Email List / Domains needed a manual
 * page reload to see new data.
 */
export function useIsTabVisible() {
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const handler = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
  return visible;
}
