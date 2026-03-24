import React from 'react';
import './ReportComponents.css';

const TokenUsageChart = ({ data, loading }) => {
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  const formatCurrency = (num) => {
    return '$' + (num || 0).toFixed(4);
  };

  const calculatePercentage = (value, total) => {
    if (!total || total === 0) return 0;
    return ((value / total) * 100).toFixed(1);
  };

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) {
    return (
      <div className="token-usage-chart">
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Loading chart data...
        </div>
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div className="token-usage-chart">
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          No usage data available
        </div>
      </div>
    );
  }

  const totalTokens = data.summary.totalTokens || 0;
  const totalCost = data.summary.totalCost || 0;
  const reportCount = data.summary.reportCount || 0;

  return (
    <div className="token-usage-chart">
      <div className="chart-header">
        <h3>Token Usage Overview</h3>
        <div className="chart-stats">
          <div className="chart-stat">
            <div className="chart-stat-value">{formatNumber(totalTokens)}</div>
            <div className="chart-stat-label">Total Tokens</div>
          </div>
          <div className="chart-stat">
            <div className="chart-stat-value">{formatCurrency(totalCost)}</div>
            <div className="chart-stat-label">Est. Cost</div>
          </div>
          <div className="chart-stat">
            <div className="chart-stat-value">{reportCount}</div>
            <div className="chart-stat-label">Reports</div>
          </div>
        </div>
      </div>

      {data.usage && data.usage.length > 0 ? (
        <div className="usage-bars">
          {data.usage.map((item, index) => (
            <div key={index} className="usage-bar-item" style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{item._id || 'Unknown'}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {formatNumber(item.totalTokens)} tokens ({calculatePercentage(item.totalTokens, totalTokens)}%)
                </span>
              </div>
              <div style={{ height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${calculatePercentage(item.totalTokens, totalTokens)}%`,
                    background: colors[index % colors.length],
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }}
                ></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{item.totalReports || 0} reports</span>
                <span>{formatCurrency(item.totalCost)}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
          No usage data for this period
        </div>
      )}
    </div>
  );
};

export default TokenUsageChart;
