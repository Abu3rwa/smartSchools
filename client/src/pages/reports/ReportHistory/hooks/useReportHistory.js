import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_HISTORY_FILTERS } from '../constants';

const useReportHistory = ({ token }) => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_HISTORY_FILTERS);
  const [retrying, setRetrying] = useState(null);

  const fetchReportHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.studentId) params.append('studentId', filters.studentId);
      if (filters.reportType) params.append('type', filters.reportType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);

      const response = await fetch(`/api/reports/history?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.success) {
        setReports(data.data);
      }
    } catch (err) {
      console.error('Error fetching report history:', err);
    } finally {
      setLoading(false);
    }
  }, [filters.endDate, filters.reportType, filters.startDate, filters.studentId, token]);

  useEffect(() => {
    fetchReportHistory();
  }, [fetchReportHistory]);

  const handleRetryEmails = useCallback(async (reportId) => {
    setRetrying(reportId);
    try {
      const response = await fetch(`/api/reports/retry-emails/${reportId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (data.success) {
        alert('Retry initiated successfully!');
        fetchReportHistory();
      } else {
        alert(data.message || 'Failed to retry emails');
      }
    } catch (err) {
      alert('Failed to retry emails');
    } finally {
      setRetrying(null);
    }
  }, [fetchReportHistory, token]);

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
    if (!emailStatus) return <span className="status-badge status-pending">Pending</span>;

    const hasSent = emailStatus.mother?.sent || emailStatus.father?.sent || emailStatus.student?.sent;
    const hasFailed = emailStatus.mother?.sent === false || emailStatus.father?.sent === false;

    if (hasFailed) return <span className="status-badge status-failed">Failed</span>;
    if (hasSent) return <span className="status-badge status-sent">Sent</span>;
    return <span className="status-badge status-pending">Pending</span>;
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