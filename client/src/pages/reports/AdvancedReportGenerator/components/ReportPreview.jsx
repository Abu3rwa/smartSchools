const ReportPreview = ({ generating, sanitizedHtml }) => (
  <div className="preview-section">
    <h3>Report Preview</h3>
    <div className="report-preview">
      {generating ? (
        <div className="loading">
          <div className="spinner"></div>
          <span style={{ marginLeft: '12px' }}>Generating report...</span>
        </div>
      ) : (
        <div className="report-preview-content" dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
      )}
    </div>
  </div>
);

export default ReportPreview;
