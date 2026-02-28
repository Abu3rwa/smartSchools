const TemplatesFilters = ({ filters, reportTypes, languages, onTypeChange, onLanguageChange }) => (
  <div className="templates-filters">
    <div className="filter-group">
      <label>Report Type</label>
      <select value={filters.type} onChange={onTypeChange}>
        <option value="">All Types</option>
        {reportTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </div>
    <div className="filter-group">
      <label>Language</label>
      <select value={filters.language} onChange={onLanguageChange}>
        <option value="">All Languages</option>
        {languages.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  </div>
);

export default TemplatesFilters;