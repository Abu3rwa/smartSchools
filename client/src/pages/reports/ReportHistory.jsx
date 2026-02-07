import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import './ReportHistory.css';

const ReportHistory = () => {
  const { token } = useSelector((state) => state.auth);
  
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    studentId: '',
    reportType: '',
    startDate: '',
    endDate: ''
  });
  const [retrying, setRetrying] = useState(null);

  useEffect(() => {
    fetchReportHistory();
  }, [token, filters]);

  const fetchReportHistory = async () => {
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
  };

  const handleRetryEmails = async (reportId) => {
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
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (emailStatus) => {
    if (!emailStatus) return <span className="status-badge status-pending">Pending</span>;
    
    const hasSent = emailStatus.mother?.sent || emailStatus.father?.sent || emailStatus.student?.sent;
    const hasFailed = emailStatus.mother?.sent === false || emailStatus.father?.sent === false;
    
    if (hasFailed) return <span className="status-badge status-failed">Failed</span>;
    if (hasSent) return <span className="status-badge status-sent">Sent</span>;
    return <span className="status-badge status-pending">Pending</span>;
  };

  const getEmailStatusDetail = (emailStatus) => {
    if (!emailStatus) return 'No emails sent';
    
    const statuses = [];
    if (emailStatus.mother) statuses.push(emailStatus.mother.sent ? '✓ Mother' : '✗ Mother');
    if (emailStatus.father) statuses.push(emailStatus.father.sent ? '✓ Father' : '✗ Father');
    if (emailStatus.student) statuses.push(emailStatus.student.sent ? '✓ Student' : '✗ Student');
    if (emailStatus.teacher) statuses.push(emailStatus.teacher.sent ? '✓ Teacher' : '✗ Teacher');
    
    return statuses.join(', ');
  };

  return (
    <div className="report-history-container">
      <div className="report-history-header">
        <h1>Report History</h1>
        <p>View and manage previously generated reports</p>
      </div>

      <div className="history-filters">
        <div className="filter-group">
          <label>Student</label>
          <input
            type="text"
            placeholder="Search by student..."
            value={filters.studentId}
            onChange={(e) => setFilters(prev => ({ ...prev, studentId: e.target.value }))}
          />
        </div>
        <div className="filter-group">
          <label>Report Type</label>
          <select
            value={filters.reportType}
            onChange={(e) => setFilters(prev => ({ ...prev, reportType: e.target.value }))}
          >
            <option value="">All Types</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="filter-group">
          <label>Start Date</label>
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
          />
        </div>
        <div className="filter-group">
          <label>End Date</label>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
          />
        </div>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading reports...</span>
        </div>
      ) : reports.length === 0 ? (
        <div className="empty-state">
          <h3>No reports found</h3>
          <p>Generate your first report to see it here</p>
        </div>
      ) : (
        <div className="history-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Student</th>
                <th>Type</th>
                <th>Language</th>
                <th>Email Status</th>
                <th>Tokens</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report._id}>
                  <td>{formatDate(report.generatedAt || report.timestamp)}</td>
                  <td>
                    <span className="student-name">
                      {report.student?.firstName} {report.student?.lastName}
                    </span>
                  </td>
                  <td>
                    <span className={`report-type-badge type-${report.reportType}`}>
                      {report.reportType}
                    </span>
                  </td>
                  <td>
                    <span className={`language-badge lang-${report.language}`}>
                      {report.language}
                    </span>
                  </td>
                  <td>
                    <div className="email-status">
                      {getStatusBadge(report.emailStatus)}
                    </div>
                    <div className="email-status-detail" style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                      {getEmailStatusDetail(report.emailStatus)}
                    </div>
                  </td>
                  <td>
                    <div className="token-usage">
                      <div>{report.totalTokens} tokens</div>
                      <div style={{ fontSize: '11px' }}>${report.estimatedCost?.toFixed(4) || '0.0000'}</div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        className="action-btn"
                        onClick={() => handleRetryEmails(report._id)}
                        disabled={retrying === report._id}
                      >
                        {retrying === report._id ? '...' : 'Retry'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ReportHistory;
