const ReportGeneratorActions = ({ onPreview, onSend, generating, sending, disabled }) => (
  <div className="action-buttons">
    <button
      type="button"
      className="btn btn-secondary"
      onClick={onPreview}
      disabled={generating || disabled}
    >
      {generating ? 'Generating...' : 'Generate Preview'}
    </button>
    <button
      type="button"
      className="btn btn-primary"
      onClick={onSend}
      disabled={sending || disabled}
    >
      {sending ? 'Sending...' : 'Generate & Send'}
    </button>
  </div>
);

export default ReportGeneratorActions;