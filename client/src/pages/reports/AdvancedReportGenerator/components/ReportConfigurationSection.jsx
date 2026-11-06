const ReportConfigurationSection = ({ reportTypes, languages, formData, onChange }) => (
  <div className="rg-panel">
    <div className="rg-panel-head">
      <h3>Report Configuration</h3>
    </div>

    <div className="rg-field">
      <label className="rg-label" htmlFor="reportType">Report Type</label>
      <select
        id="reportType"
        name="reportType"
        className="rg-select"
        value={formData.reportType}
        onChange={onChange}
      >
        {reportTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </div>

    <div className="rg-field">
      <label className="rg-label" htmlFor="primaryLanguage">Primary Language</label>
      <select
        id="primaryLanguage"
        name="primaryLanguage"
        className="rg-select"
        value={formData.primaryLanguage}
        onChange={onChange}
      >
        {languages.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>

    <div className="rg-field">
      <label className="rg-label" htmlFor="secondaryLanguage">Secondary Language</label>
      <select
        id="secondaryLanguage"
        name="secondaryLanguage"
        className="rg-select"
        value={formData.secondaryLanguage}
        onChange={onChange}
      >
        <option value="">None</option>
        {languages
          .filter((lang) => lang.value !== formData.primaryLanguage)
          .map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
      </select>
    </div>

    {formData.reportType === 'custom' && (
      <div className="rg-field">
        <label className="rg-label">Date Range</label>
        <div className="rg-date-row">
          <input
            type="date"
            className="rg-input"
            id="dateRange.startDate"
            name="dateRange.startDate"
            value={formData.dateRange.startDate}
            onChange={onChange}
            title="Start date"
          />
          <input
            type="date"
            className="rg-input"
            id="dateRange.endDate"
            name="dateRange.endDate"
            value={formData.dateRange.endDate}
            onChange={onChange}
            title="End date"
          />
        </div>
      </div>
    )}
  </div>
);

export default ReportConfigurationSection;
