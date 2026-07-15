import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationDropdown from './NotificationDropdown';
import NotificationBadge from './NotificationBadge';

// Same small pattern already used elsewhere in Layout.jsx for its other
// dropdowns (sidebar/header profile menus) — kept local here rather than
// extracted/shared, consistent with how those existing dropdowns each keep
// their own copy.
function useEscapeToClose(isOpen, onClose) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    isError,
    markAsRead,
    markAllAsRead,
    deleteOne,
    clearAll,
    isMutating,
  } = useNotifications();

  const [pulse, setPulse] = useState(false);
  const prevUnreadRef = useRef(unreadCount);

  // Badge briefly bounces whenever unread count goes UP (a new notification
  // arrived) — not on every poll, and not when it goes down (marking read).
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 1000);
      prevUnreadRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEscapeToClose(open, () => setOpen(false));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 hover:bg-[var(--muted)] transition text-[var(--foreground)]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Bell size={20} aria-hidden="true" />
        <NotificationBadge count={unreadCount} pulse={pulse} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <NotificationDropdown
            notifications={notifications}
            isLoading={isLoading}
            isError={isError}
            unreadCount={unreadCount}
            onMarkRead={markAsRead}
            onMarkAllRead={markAllAsRead}
            onDelete={deleteOne}
            onClearAll={clearAll}
            isMutating={isMutating}
          />
        </>
      )}
    </div>
  );
}
