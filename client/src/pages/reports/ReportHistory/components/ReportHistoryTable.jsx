const ReportHistoryTable = ({ reports, retrying, onRetry, formatDate, getStatusBadge, getEmailStatusDetail }) => (
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
              {(() => {
                const badge = getStatusBadge(report.emailStatus);
                return (
                  <div className="email-status">
                    <span className={`status-badge ${badge.className}`}>{badge.label}</span>
                  </div>
                );
              })()}
              <div
                className="email-status-detail"
                style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}
              >
                {getEmailStatusDetail(report.emailStatus)}
              </div>
            </td>
            <td>
              <div className="token-usage">
                <div>{report.totalTokens} tokens</div>
                <div style={{ fontSize: '11px' }}>
                  ${report.estimatedCost?.toFixed(4) || '0.0000'}
                </div>
              </div>
            </td>
            <td>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="action-btn"
                  onClick={() => onRetry(report._id)}
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
);

export default ReportHistoryTable;
