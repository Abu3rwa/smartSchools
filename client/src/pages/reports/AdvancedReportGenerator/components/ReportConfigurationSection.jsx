const ReportConfigurationSection = ({ reportTypes, languages, formData, onChange }) => (
  <div className="form-section">
    <h3>Report Configuration</h3>
    <div className="form-group">
      <label htmlFor="reportType">Report Type</label>
      <select id="reportType" name="reportType" value={formData.reportType} onChange={onChange}>
        {reportTypes.map((type) => (
          <option key={type.value} value={type.value}>
            {type.label}
          </option>
        ))}
      </select>
    </div>

    <div className="form-group">
      <label htmlFor="primaryLanguage">Primary Language</label>
      <select
        id="primaryLanguage"
        name="primaryLanguage"
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

    <div className="form-group">
      <label htmlFor="secondaryLanguage">Secondary Language (Optional)</label>
      <select
        id="secondaryLanguage"
        name="secondaryLanguage"
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
      <div className="date-range-inputs">
        <div className="form-group">
          <label htmlFor="dateRange.startDate">Start Date</label>
          <input
            type="date"
            id="dateRange.startDate"
            name="dateRange.startDate"
            value={formData.dateRange.startDate}
            onChange={onChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="dateRange.endDate">End Date</label>
          <input
            type="date"
            id="dateRange.endDate"
            name="dateRange.endDate"
            value={formData.dateRange.endDate}
            onChange={onChange}
          />
        </div>
      </div>
    )}
  </div>
);

export default ReportConfigurationSection;
