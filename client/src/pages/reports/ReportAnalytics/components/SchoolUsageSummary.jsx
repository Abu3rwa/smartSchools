const SchoolUsageSummary = ({ summary, formatNumber, formatCurrency }) => (
  <div className="analytics-section">
    <h2>School-wide Usage</h2>
    <div className="school-usage-summary">
      <div className="school-stat">
        <span className="label">Total School Tokens</span>
        <span className="value">{formatNumber(summary?.totalTokens || 0)}</span>
      </div>
      <div className="school-stat">
        <span className="label">Total School Cost</span>
        <span className="value">{formatCurrency(summary?.totalCost)}</span>
      </div>
      <div className="school-stat">
        <span className="label">School Reports</span>
        <span className="value">{summary?.reportCount || 0}</span>
      </div>
    </div>
  </div>
);

export default SchoolUsageSummary;