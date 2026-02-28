const UsageByLanguage = ({ usage, formatNumber, formatCurrency }) => (
  <div className="analytics-section">
    <h2>Token Usage by Language</h2>
    <div className="language-grid">
      {usage.map((item) =>
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
      )}
    </div>
  </div>
);

export default UsageByLanguage;