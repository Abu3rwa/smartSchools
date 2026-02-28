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
        <div className="recipient-checkbox">
          <input
            type="checkbox"
            id="recipients.mother"
            name="recipients.mother"
            checked={formData.recipients.mother}
            onChange={onChange}
          />
          <label htmlFor="recipients.mother">Mother</label>
        </div>
        <div className="recipient-checkbox">
          <input
            type="checkbox"
            id="recipients.father"
            name="recipients.father"
            checked={formData.recipients.father}
            onChange={onChange}
          />
          <label htmlFor="recipients.father">Father</label>
        </div>
        <div className="recipient-checkbox">
          <input
            type="checkbox"
            id="recipients.student"
            name="recipients.student"
            checked={formData.recipients.student}
            onChange={onChange}
          />
          <label htmlFor="recipients.student">Student</label>
        </div>
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