import { useCallback, useEffect, useState } from 'react';
import api from '../../../../config/api';
import { DEFAULT_HISTORY_FILTERS } from '../constants';

const useReportHistory = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_HISTORY_FILTERS);
  const [retrying, setRetrying] = useState(null);

  const fetchReportHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.studentId) params.studentId = filters.studentId;
      if (filters.reportType) params.type = filters.reportType;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;

      const response = await api.get('/reports/history', { params });

      if (response.data.success) {
        setReports(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching report history:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.endDate, filters.reportType, filters.startDate, filters.studentId]);

  useEffect(() => {
    fetchReportHistory();
  }, [fetchReportHistory]);

  const handleRetryEmails = useCallback(async (reportId) => {
    setRetrying(reportId);
    try {
      const response = await api.post(`/reports/retry-emails/${reportId}`);

      if (response.data.success) {
        alert('Retry initiated successfully!');
        fetchReportHistory();
      } else {
        alert(response.data.message || 'Failed to retry emails');
      }
    } catch (err) {
      alert('Failed to retry emails');
    } finally {
      setRetrying(null);
    }
  }, [fetchReportHistory]);

  const formatDate = useCallback((dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  const getStatusBadge = useCallback((emailStatus) => {
    if (!emailStatus) return { label: 'Pending', className: 'status-pending' };

    const hasSent = emailStatus.mother?.sent || emailStatus.father?.sent || emailStatus.student?.sent;
    const hasFailed = emailStatus.mother?.sent === false || emailStatus.father?.sent === false;

    if (hasFailed) return { label: 'Failed', className: 'status-failed' };
    if (hasSent) return { label: 'Sent', className: 'status-sent' };
    return { label: 'Pending', className: 'status-pending' };
  }, []);

  const getEmailStatusDetail = useCallback((emailStatus) => {
    if (!emailStatus) return 'No emails sent';

    const statuses = [];
    if (emailStatus.mother) statuses.push(emailStatus.mother.sent ? '✓ Mother' : '✗ Mother');
    if (emailStatus.father) statuses.push(emailStatus.father.sent ? '✓ Father' : '✗ Father');
    if (emailStatus.student) statuses.push(emailStatus.student.sent ? '✓ Student' : '✗ Student');
    if (emailStatus.teacher) statuses.push(emailStatus.teacher.sent ? '✓ Teacher' : '✗ Teacher');

    return statuses.join(', ');
  }, []);

  return {
    reports,
    loading,
    filters,
    setFilters,
    retrying,
    fetchReportHistory,
    handleRetryEmails,
    formatDate,
    getStatusBadge,
    getEmailStatusDetail
  };
};

export default useReportHistory;
