const UsageByReportType = ({ usage, totalTokens, colors, formatNumber, formatCurrency, calculatePercentage }) => (
  <div className="analytics-section">
    <h2>Token Usage by Report Type</h2>
    <div className="usage-chart">
      {usage?.length > 0 ? (
        usage.map((item, index) => (
          <div key={item._id || index} className="usage-bar">
            <div className="bar-label">
              <span className="report-type">{item._id || 'Unknown'}</span>
              <span className="report-count">{item.totalReports || 0} reports</span>
            </div>
            <div className="bar-container">
              <div
                className="bar-fill"
                style={{
                  width: `${calculatePercentage(item.totalTokens, totalTokens || 1)}%`,
                  backgroundColor: colors[index % colors.length]
                }}
              ></div>
            </div>
            <div className="bar-stats">
              <span>{formatNumber(item.totalTokens)} tokens</span>
              <span>{formatCurrency(item.totalCost)}</span>
            </div>
          </div>
        ))
      ) : (
        <p className="no-data">No usage data available for this period</p>
      )}
    </div>
  </div>
);

export default UsageByReportType;