import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchNotificationHistory,
  selectNotifications,
  selectNotificationsLoading,
} from '../../../../store/slices/notificationSlice';
import { getStatusCategory } from '../utils/notificationPresentation';

export default function useNotificationsData({ academicYear, searchTerm, statusFilter, typeFilter }) {
  const dispatch = useDispatch();
  const notifications = useSelector(selectNotifications);
  const loading = useSelector(selectNotificationsLoading);

  useEffect(() => {
    dispatch(fetchNotificationHistory());
  }, [dispatch, academicYear]);

  const refetchHistory = useCallback(() => {
    dispatch(fetchNotificationHistory());
  }, [dispatch]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const notificationTypes = useMemo(
    () => Array.from(new Set(notifications.map((n) => n.type).filter(Boolean))).sort(),
    [notifications]
  );

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        const category = getStatusCategory(notification.status);
        const matchesStatus = statusFilter === 'all' || category === statusFilter;
        const matchesType = typeFilter === 'all' || notification.type === typeFilter;
        if (!matchesStatus || !matchesType) return false;
        if (!normalizedSearch) return true;

        const studentName = `${notification.student?.firstName || ''} ${notification.student?.lastName || ''}`.trim();
        const haystack = [
          notification.recipientEmail,
          notification.subject,
          notification.type,
          studentName,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      }),
    [notifications, normalizedSearch, statusFilter, typeFilter]
  );

  const totalSent = notifications.length;
  const deliveredCount = notifications.filter((n) => n.status === 'sent').length;
  const failedCount = notifications.filter((n) => n.status === 'failed').length;
  const pendingCount = notifications.filter((n) => getStatusCategory(n.status) === 'pending').length;

  return {
    notifications,
    loading,
    notificationTypes,
    filteredNotifications,
    totalSent,
    deliveredCount,
    failedCount,
    pendingCount,
    refetchHistory,
  };
}
