import { CheckCheck, Trash2, Inbox } from 'lucide-react';
import NotificationItem from './NotificationItem';

function LoadingSkeleton() {
  return (
    <div className="p-3.5 space-y-4" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 animate-pulse">
          <div className="h-8 w-8 rounded-lg bg-[var(--muted)]" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="h-3 w-2/3 bg-[var(--muted)] rounded" />
            <div className="h-2.5 w-full bg-[var(--muted)] rounded" />
            <div className="h-2 w-1/4 bg-[var(--muted)] rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotificationDropdown({
  notifications,
  isLoading,
  isError,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onClearAll,
  isMutating,
}) {
  return (
    <div
      role="menu"
      aria-label="Notifications"
      className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 max-h-[28rem] flex flex-col rounded-xl border border-[var(--muted)] bg-[var(--card)] shadow-xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--muted)]">
        <p className="text-sm font-semibold text-[var(--foreground)]">
          Notifications
          {unreadCount > 0 && (
            <span className="ml-1.5 text-[var(--foreground)]/40 font-normal">({unreadCount} unread)</span>
          )}
        </p>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => onMarkAllRead()}
              disabled={isMutating}
              className="flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-[var(--accent)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => onClearAll()}
              disabled={isMutating}
              className="p-1.5 rounded-md text-[var(--foreground)]/40 hover:text-error hover:bg-error/10 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              aria-label="Clear all notifications"
              title="Clear all"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <div className="overflow-y-auto flex-1">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <div className="px-3.5 py-8 text-center">
            <p className="text-sm text-error">Couldn't load notifications</p>
            <p className="text-xs text-[var(--foreground)]/40 mt-1">Will retry automatically</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-3.5 py-10 text-center">
            <Inbox className="h-8 w-8 text-[var(--foreground)]/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm text-[var(--foreground)]/50">No notifications yet</p>
            <p className="text-xs text-[var(--foreground)]/30 mt-1">You're all caught up</p>
          </div>
        ) : (
          <ul>
            {notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} onMarkRead={onMarkRead} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
