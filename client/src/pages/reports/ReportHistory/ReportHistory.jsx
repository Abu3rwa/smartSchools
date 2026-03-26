import { REPORT_TYPE_OPTIONS } from './constants';
import ReportHistoryHeader from './components/ReportHistoryHeader';
import ReportHistoryFilters from './components/ReportHistoryFilters';
import ReportHistoryLoadingState from './components/ReportHistoryLoadingState';
import ReportHistoryEmptyState from './components/ReportHistoryEmptyState';
import ReportHistoryTable from './components/ReportHistoryTable';
import useReportHistory from './hooks/useReportHistory';
import './ReportHistory.css';

const ReportHistory = () => {
  const {
    reports,
    loading,
    filters,
    setFilters,
    retrying,
    handleRetryEmails,
    formatDate,
    getStatusBadge,
    getEmailStatusDetail
  } = useReportHistory();

  return (
    <div className="report-history-container">
      <ReportHistoryHeader />

      <ReportHistoryFilters
        filters={filters}
        reportTypes={REPORT_TYPE_OPTIONS}
        onStudentChange={(event) =>
          setFilters((prev) => ({ ...prev, studentId: event.target.value }))
        }
        onTypeChange={(event) =>
          setFilters((prev) => ({ ...prev, reportType: event.target.value }))
        }
        onStartDateChange={(event) =>
          setFilters((prev) => ({ ...prev, startDate: event.target.value }))
        }
        onEndDateChange={(event) =>
          setFilters((prev) => ({ ...prev, endDate: event.target.value }))
        }
      />

      {loading ? (
        <ReportHistoryLoadingState />
      ) : reports.length === 0 ? (
        <ReportHistoryEmptyState />
      ) : (
        <ReportHistoryTable
          reports={reports}
          retrying={retrying}
          onRetry={handleRetryEmails}
          formatDate={formatDate}
          getStatusBadge={getStatusBadge}
          getEmailStatusDetail={getEmailStatusDetail}
        />
      )}
    </div>
  );
};

export default ReportHistory;