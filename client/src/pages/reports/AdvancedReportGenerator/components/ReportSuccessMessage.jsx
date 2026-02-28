const ReportSuccessMessage = ({ success }) => (
  <div className="success-message">
    <h4>✅ {success.message}</h4>
    {success.details && (
      <div style={{ marginTop: '12px' }}>
        <p>
          <strong>Sent to:</strong>
        </p>
        <ul style={{ marginTop: '8px', paddingLeft: '20px' }}>
          {success.details.primaryRecipients > 0 && (
            <li>{success.details.primaryRecipients} parent(s)</li>
          )}
          {success.details.ccRecipients > 0 && (
            <li>{success.details.ccRecipients} CC recipient(s)</li>
          )}
        </ul>
        <p style={{ marginTop: '12px', fontSize: '13px', color: '#065f46' }}>
          📧 Email sent successfully! Recipients will receive the report shortly.
        </p>
      </div>
    )}
  </div>
);

export default ReportSuccessMessage;