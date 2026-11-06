const EmailRecipientsSection = ({ formData, onChange }) => (
  <div className="rg-panel">
    <div className="rg-panel-head">
      <h3>Email Recipients</h3>
    </div>

    <label className="rg-check" style={{ marginBottom: '8px' }}>
      <input
        type="checkbox"
        name="sendEmail"
        checked={formData.sendEmail}
        onChange={onChange}
      />
      <span>Send report via email</span>
    </label>

    {formData.sendEmail && (
      <>
        <p className="rg-data-summary" style={{ marginBottom: '8px' }}>
          The report always goes to every student-related email on file (student, mother, father, guardian).
        </p>
        <div className="rg-recipients">
          <label className="rg-check">
            <input
              type="checkbox"
              id="recipients.teacher"
              name="recipients.teacher"
              checked={formData.recipients.teacher}
              onChange={onChange}
            />
            <span>Teacher (CC)</span>
          </label>
        </div>
      </>
    )}
  </div>
);

export default EmailRecipientsSection;
