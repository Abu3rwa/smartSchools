const ReportPreview = ({ report, generating, sanitizedHtml }) => (
  <div className="preview-section">
    <h3>Report Preview</h3>
    <div className="report-preview">
      {generating ? (
        <div className="loading">
          <div className="spinner"></div>
          <span style={{ marginLeft: '12px' }}>Generating report...</span>
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      )}
    </div>

    {report?.tokenUsage && (
      <div
        style={{
          marginTop: '16px',
          padding: '12px',
          background: '#f1f5f9',
          borderRadius: '8px',
          fontSize: '13px'
        }}
      >
        <strong>Token Usage:</strong> {report.tokenUsage.totalTokens} tokens |
        <strong> Est. Cost:</strong> ${report.tokenUsage.estimatedCost?.toFixed(4) || '0.0000'}
      </div>
    )}
  </div>
);

export default ReportPreview;