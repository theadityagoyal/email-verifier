import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearAllNotifications,
} from '@/services/api';

const POLL_INTERVAL_MS = 15000;
const NOTIFICATIONS_QUERY_KEY = ['notifications-list'];

const TOAST_ICON = {
  success: '✅',
  error: '⛔',
  warning: '⚠️',
  info: 'ℹ️',
};

/**
 * Single source of truth for the notification bell: one polling query
 * (every 15s) whose response carries both the page of notifications AND
 * `unread_count`, so the badge and the dropdown list share one fetch
 * instead of two. NotificationBell and NotificationDropdown both call this
 * hook with the SAME query key, so opening the dropdown reads from cache
 * instantly rather than triggering an extra request.
 *
 * Also owns "new notification -> toast" logic: on every successful poll it
 * diffs the incoming unread ids against ones already seen this session and
 * toasts only the truly-new ones, exactly once each (never on first load).
 */
export function useNotifications() {
  const queryClient = useQueryClient();
  const seenIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  const query = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => listNotifications({ page: 1, size: 20 }),
    refetchInterval: () => (document.visibilityState === 'visible' ? POLL_INTERVAL_MS : false),
    refetchOnWindowFocus: true,
    staleTime: 5000,
  });

  useEffect(() => {
    const items = query.data?.items;
    if (!items) return;

    if (isFirstLoadRef.current) {
      // Don't toast for anything that already existed before this session
      // started — only genuinely new arrivals after this point.
      items.forEach((n) => seenIdsRef.current.add(n.id));
      isFirstLoadRef.current = false;
      return;
    }

    const newlyArrived = items.filter((n) => !seenIdsRef.current.has(n.id));
    newlyArrived
      .filter((n) => !n.is_read)
      .forEach((n) => {
        toast(`${TOAST_ICON[n.type] || TOAST_ICON.info}  ${n.title}`, {
          id: `notification-toast-${n.id}`, // stable id -> react-hot-toast
                                               // de-dupes automatically if this
                                               // somehow fires twice for the
                                               // same notification
          duration: 5000,
        });
      });

    items.forEach((n) => seenIdsRef.current.add(n.id));
  }, [query.data]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Trigger a refetch to re-evaluate the refetchInterval function
      query.refetch();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [query]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  };

  const markAsReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
  });

  const deleteOneMutation = useMutation({
    mutationFn: deleteNotification,
    onSuccess: invalidate,
  });

  const clearAllMutation = useMutation({
    mutationFn: clearAllNotifications,
    onSuccess: invalidate,
  });

  return {
    notifications: query.data?.items || [],
    unreadCount: query.data?.unread_count || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    markAsRead: markAsReadMutation.mutate,
    markAllAsRead: markAllAsReadMutation.mutate,
    deleteOne: deleteOneMutation.mutate,
    clearAll: clearAllMutation.mutate,
    isMutating:
      markAsReadMutation.isPending ||
      markAllAsReadMutation.isPending ||
      deleteOneMutation.isPending ||
      clearAllMutation.isPending,
  };
}