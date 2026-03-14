const EmailRecipientsSection = ({ formData, onChange }) => (
  <div className="form-section">
    <h3>Email Recipients</h3>
    <div className="form-group">
      <label>
        <input
          type="checkbox"
          name="sendEmail"
          checked={formData.sendEmail}
          onChange={onChange}
          style={{ marginRight: '8px' }}
        />
        Send report via email
      </label>
    </div>

    {formData.sendEmail && (
      <div className="recipient-checkboxes">
        <p className="text-muted" style={{ margin: '0 0 12px' }}>
          The report will always be sent to every student-related email on file, including student, mother, father, and guardian addresses when available.
        </p>
        <div className="recipient-checkbox">
          <input
            type="checkbox"
            id="recipients.teacher"
            name="recipients.teacher"
            checked={formData.recipients.teacher}
            onChange={onChange}
          />
          <label htmlFor="recipients.teacher">Teacher (CC)</label>
        </div>
      </div>
    )}
  </div>
);

export default EmailRecipientsSection;
