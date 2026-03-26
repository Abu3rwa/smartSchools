import { useSelector } from 'react-redux';
import { PERIOD_OPTIONS, USAGE_BAR_COLORS, YEAR_OPTIONS } from './constants';
import AnalyticsHeader from './components/AnalyticsHeader';
import AnalyticsFilters from './components/AnalyticsFilters';
import AnalyticsLoadingState from './components/AnalyticsLoadingState';
import SummaryCard from './components/SummaryCard';
import UsageByReportType from './components/UsageByReportType';
import UsageByLanguage from './components/UsageByLanguage';
import SchoolUsageSummary from './components/SchoolUsageSummary';
import useReportAnalytics from './hooks/useReportAnalytics';
import './ReportAnalytics.css';

const ReportAnalytics = () => {
  const { user } = useSelector((state) => state.auth);
  const {
    period,
    setPeriod,
    year,
    setYear,
    userUsage,
    schoolUsage,
    userSummary,
    loading,
    fetchAnalytics,
    calculatePercentage,
    formatNumber,
    formatCurrency
  } = useReportAnalytics({ user });

  return (
    <div className="analytics-container">
      <AnalyticsHeader />

      <AnalyticsFilters
        period={period}
        year={year}
        periods={PERIOD_OPTIONS}
        years={YEAR_OPTIONS}
        onPeriodChange={(event) => setPeriod(event.target.value)}
        onYearChange={(event) => setYear(event.target.value)}
        onRefresh={fetchAnalytics}
      />

      {loading ? (
        <AnalyticsLoadingState />
      ) : (
        <>
          <div className="analytics-cards">
            <SummaryCard
              title="Total Tokens"
              value={formatNumber(userSummary?.totalTokens || 0)}
              tone="blue"
              icon={
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-4H8v-2h2V9h2v2h2v2h-2v4z" />
                </svg>
              }
            />
            <SummaryCard
              title="Estimated Cost"
              value={formatCurrency(userSummary?.totalCost)}
              tone="green"
              icon={
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" />
                </svg>
              }
            />
            <SummaryCard
              title="Reports Generated"
              value={userSummary?.reportCount || 0}
              tone="purple"
              icon={
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" />
                </svg>
              }
            />
            <SummaryCard
              title="Avg Tokens/Report"
              value={
                userSummary?.reportCount
                  ? formatNumber(userSummary.totalTokens / userSummary.reportCount)
                  : 0
              }
              tone="orange"
              icon={
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                </svg>
              }
            />
          </div>

          <UsageByReportType
            usage={userUsage?.usage || []}
            totalTokens={userSummary?.totalTokens || 0}
            colors={USAGE_BAR_COLORS}
            formatNumber={formatNumber}
            formatCurrency={formatCurrency}
            calculatePercentage={calculatePercentage}
          />

          {userUsage?.usage?.some((usage) => usage.languages?.length > 0) && (
            <UsageByLanguage
              usage={userUsage.usage}
              formatNumber={formatNumber}
              formatCurrency={formatCurrency}
            />
          )}

          {user?.role === 'admin' && schoolUsage && (
            <SchoolUsageSummary
              summary={schoolUsage.summary}
              formatNumber={formatNumber}
              formatCurrency={formatCurrency}
            />
          )}
        </>
      )}
    </div>
  );
};

export default ReportAnalytics;
