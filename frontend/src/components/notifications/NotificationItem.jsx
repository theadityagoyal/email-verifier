import { CheckCircle, XCircle, AlertTriangle, Info, Trash2, Check } from 'lucide-react';
import { relativeTime } from '@/utils/dateUtils';

const TYPE_CONFIG = {
  success: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10' },
  error: { icon: XCircle, color: 'text-error', bg: 'bg-error/10' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  info: { icon: Info, color: 'text-info', bg: 'bg-info/10' },
};

const PRIORITY_DOT = {
  high: 'bg-error',
  medium: 'bg-warning',
  low: 'bg-[var(--foreground)]/30',
};

const PRIORITY_LABEL = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export default function NotificationItem({ notification, onMarkRead, onDelete }) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  return (
    <li
      role="menuitem"
      className={`group relative flex items-start gap-3 px-3.5 py-3 border-b border-[var(--muted)] last:border-0 transition-colors hover:bg-[var(--muted)]/40 ${
        notification.is_read ? 'opacity-70' : 'bg-[var(--accent)]/[0.04]'
      }`}
    >
      <span
        className={`mt-1.5 flex h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[notification.priority] || PRIORITY_DOT.low} ${
          notification.is_read ? 'invisible' : ''
        }`}
        title={PRIORITY_LABEL[notification.priority] || undefined}
        aria-hidden="true"
      />

      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
        <Icon className={`h-4 w-4 ${config.color}`} aria-hidden="true" />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`text-sm text-[var(--foreground)] truncate ${
            notification.is_read ? 'font-medium' : 'font-semibold'
          }`}
        >
          {notification.title}
        </p>
        <p className="text-xs text-[var(--foreground)]/60 mt-0.5 line-clamp-2">{notification.message}</p>
        <p className="text-[11px] text-[var(--foreground)]/40 mt-1">{relativeTime(notification.created_at)}</p>
      </div>

      <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity">
        {!notification.is_read && (
          <button
            type="button"
            onClick={() => onMarkRead(notification.id)}
            className="p-1.5 rounded-md text-[var(--foreground)]/50 hover:text-success hover:bg-success/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label={`Mark "${notification.title}" as read`}
            title="Mark as read"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(notification.id)}
          className="p-1.5 rounded-md text-[var(--foreground)]/50 hover:text-error hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          aria-label={`Delete "${notification.title}"`}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}
