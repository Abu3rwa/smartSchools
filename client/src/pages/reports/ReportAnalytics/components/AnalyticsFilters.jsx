const AnalyticsFilters = ({ period, year, periods, years, onPeriodChange, onYearChange, onRefresh }) => (
  <div className="analytics-filters">
    <div className="filter-group">
      <label>Period</label>
      <select value={period} onChange={onPeriodChange}>
        {periods.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
    <div className="filter-group">
      <label>Year</label>
      <select value={year} onChange={onYearChange}>
        {years.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
    </div>
    <button className="btn btn-secondary" onClick={onRefresh}>
      Refresh
    </button>
  </div>
);

export default AnalyticsFilters;