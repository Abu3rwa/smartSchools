const MAX_LENGTH = 1200;

const TeacherRemarkSection = ({ value, onChange, onBlur }) => {
  const length = value.length;

  return (
    <div className="rg-panel">
      <div className="rg-panel-head">
        <h3>Note from the Teacher</h3>
        <span className="rg-hint">Optional</span>
      </div>
      <div className="rg-field">
        <label className="rg-label" htmlFor="teacherRemark">
          A personal message to the family
        </label>
        <textarea
          id="teacherRemark"
          name="teacherRemark"
          className="rg-textarea"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          maxLength={MAX_LENGTH}
          placeholder="Write your own words here. They appear in the email exactly as written."
          rows={4}
        />
        <div className="rg-field-foot">
          <span>Sent word for word — the AI never edits this.</span>
          <span>{length}/{MAX_LENGTH}</span>
        </div>
      </div>
    </div>
  );
};

export default TeacherRemarkSection;
