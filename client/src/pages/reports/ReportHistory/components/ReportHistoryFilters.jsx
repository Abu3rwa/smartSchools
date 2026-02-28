const ReportHistoryFilters = ({ filters, reportTypes, onStudentChange, onTypeChange, onStartDateChange, onEndDateChange }) => (
  <div className="history-filters">
    <div className="filter-group">
      <label>Student</label>
      <input
        type="text"
        placeholder="Search by student..."
        value={filters.studentId}
        onChange={onStudentChange}
      />
    </div>
    <div className="filter-group">
      <label>Report Type</label>
      <select value={filters.reportType} onChange={onTypeChange}>
        {reportTypes.map((option) => (
          <option key={option.value || 'all'} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
    <div className="filter-group">
      <label>Start Date</label>
      <input type="date" value={filters.startDate} onChange={onStartDateChange} />
    </div>
    <div className="filter-group">
      <label>End Date</label>
      <input type="date" value={filters.endDate} onChange={onEndDateChange} />
    </div>
  </div>
);

export default ReportHistoryFilters;