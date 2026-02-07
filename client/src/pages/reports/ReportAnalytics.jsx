import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import './ReportAnalytics.css';

const ReportAnalytics = () => {
  const { token, user } = useSelector((state) => state.auth);
  
  const [period, setPeriod] = useState('monthly');
  const [year, setYear] = useState(new Date().getFullYear());
  const [userUsage, setUserUsage] = useState(null);
  const [schoolUsage, setSchoolUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, [token, period, year]);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      // Fetch user token usage
      const userResponse = await fetch(
        `/api/reports/token-usage?period=${period}&year=${year}`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      const userData = await userResponse.json();
      if (userData.success) {
        setUserUsage(userData.data);
      }

      // Fetch school token usage (admin only)
      if (user.role === 'admin') {
        const schoolResponse = await fetch(
          `/api/reports/token-usage/school/${user.school}?period=${period}&year=${year}`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const schoolData = await schoolResponse.json();
        if (schoolData.success) {
          setSchoolUsage(schoolData.data);
        }
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const periods = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }
  ];

  const years = [2024, 2025, 2026];

  // Calculate simple metrics for visualization
  const calculatePercentage = (value, total) => {
    if (!total || total === 0) return 0;
    return ((value / total) * 100).toFixed(1);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const formatCurrency = (num) => {
    return '$' + (num || 0).toFixed(4);
  };

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <h1>Report Analytics Dashboard</h1>
        <p>Track AI token usage and report generation metrics</p>
      </div>

      {/* Filters */}
      <div className="analytics-filters">
        <div className="filter-group">
          <label>Period</label>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periods.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label>Year</label>
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" onClick={fetchAnalytics}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="loading-state">
          <div className="spinner"></div>
          <span>Loading analytics...</span>
        </div>
      ) : (
        <>
          {/* User Usage Summary */}
          <div className="analytics-cards">
            <div className="analytics-card">
              <div className="card-icon blue">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H8v-2h2V9h2v2h2v2h-2v4z"/>
                </svg>
              </div>
              <div className="card-content">
                <h3>Total Tokens</h3>
                <p className="big-number">{formatNumber(userUsage?.summary?.totalTokens || 0)}</p>
              </div>
            </div>

            <div className="analytics-card">
              <div className="card-icon green">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/>
                </svg>
              </div>
              <div className="card-content">
                <h3>Estimated Cost</h3>
                <p className="big-number">{formatCurrency(userUsage?.summary?.totalCost)}</p>
              </div>
            </div>

            <div className="analytics-card">
              <div className="card-icon purple">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                </svg>
              </div>
              <div className="card-content">
                <h3>Reports Generated</h3>
                <p className="big-number">{userUsage?.summary?.reportCount || 0}</p>
              </div>
            </div>

            <div className="analytics-card">
              <div className="card-icon orange">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
              </div>
              <div className="card-content">
                <h3>Avg Tokens/Report</h3>
                <p className="big-number">
                  {userUsage?.summary?.reportCount 
                    ? formatNumber(userUsage.summary.totalTokens / userUsage.summary.reportCount)
                    : 0}
                </p>
              </div>
            </div>
          </div>

          {/* Usage by Report Type */}
          <div className="analytics-section">
            <h2>Token Usage by Report Type</h2>
            <div className="usage-chart">
              {userUsage?.usage?.length > 0 ? (
                userUsage.usage.map((item, index) => (
                  <div key={index} className="usage-bar">
                    <div className="bar-label">
                      <span className="report-type">{item._id || 'Unknown'}</span>
                      <span className="report-count">{item.totalReports || 0} reports</span>
                    </div>
                    <div className="bar-container">
                      <div 
                        className="bar-fill"
                        style={{ 
                          width: `${calculatePercentage(item.totalTokens, userUsage?.summary?.totalTokens || 1)}%`,
                          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]
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

          {/* Usage by Language */}
          {userUsage?.usage?.some(u => u.languages?.length > 0) && (
            <div className="analytics-section">
              <h2>Token Usage by Language</h2>
              <div className="language-grid">
                {userUsage.usage.map((item) => (
                  item.languages?.map((lang, idx) => (
                    <div key={`${item._id}-${idx}`} className="language-card">
                      <h4>{lang.language}</h4>
                      <p className="lang-report-type">{item._id || 'Unknown'} Reports</p>
                      <div className="lang-stats">
                        <div>
                          <span className="label">Tokens</span>
                          <span>{formatNumber(lang.totalTokens)}</span>
                        </div>
                        <div>
                          <span className="label">Cost</span>
                          <span>{formatCurrency(lang.totalCost)}</span>
                        </div>
                        <div>
                          <span className="label">Count</span>
                          <span>{lang.reportCount}</span>
                        </div>
                      </div>
                    </div>
                  ))
                ))}
              </div>
            </div>
          )}

          {/* School Usage (Admin only) */}
          {user.role === 'admin' && schoolUsage && (
            <div className="analytics-section">
              <h2>School-wide Usage</h2>
              <div className="school-usage-summary">
                <div className="school-stat">
                  <span className="label">Total School Tokens</span>
                  <span className="value">{formatNumber(schoolUsage.summary?.totalTokens || 0)}</span>
                </div>
                <div className="school-stat">
                  <span className="label">Total School Cost</span>
                  <span className="value">{formatCurrency(schoolUsage.summary?.totalCost)}</span>
                </div>
                <div className="school-stat">
                  <span className="label">School Reports</span>
                  <span className="value">{schoolUsage.summary?.reportCount || 0}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ReportAnalytics;
