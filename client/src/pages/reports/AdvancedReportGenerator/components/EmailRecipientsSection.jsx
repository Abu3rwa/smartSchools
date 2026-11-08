import { RECIPIENT_ROLES, hasFamilyRecipient } from '../reportDeliveryUi';

// Recipients freeze at approval, so once a draft is approved the checkboxes
// have to say so instead of looking like they changed the pending email.
const EmailRecipientsSection = ({ formData, onChange, locked }) => (
  <div className="rg-panel">
    <div className="rg-panel-head">
      <h3>Email Recipients</h3>
      <span className="rg-hint">{locked ? 'Locked — reopen the draft to change' : 'Choose who receives it'}</span>
    </div>

    <div className="rg-recipients">
      {RECIPIENT_ROLES.map((role) => (
        <label key={role.key} className="rg-check">
          <input
            type="checkbox"
            name={`recipients.${role.key}`}
            checked={!!formData.recipients?.[role.key]}
            onChange={onChange}
            disabled={locked}
          />
          <span>{role.label}</span>
        </label>
      ))}
    </div>

    <p className="rg-data-summary" style={{ marginTop: '8px' }}>
      Only checked roles are emailed, and only when that address exists on the student’s record.
      A shared family address is sent to once, even if several checked roles use it.
    </p>

    {!hasFamilyRecipient(formData?.recipients) && (
      <p className="rg-notice is-warn">
        No family member is selected. Approval needs at least one of student, mother, father or guardian —
        a teacher-only copy is not a report delivery.
      </p>
    )}

    {locked && (
      <p className="rg-notice is-warn">
        This draft is already approved. Reopen it to change who receives the report.
      </p>
    )}
  </div>
);

export default EmailRecipientsSection;
