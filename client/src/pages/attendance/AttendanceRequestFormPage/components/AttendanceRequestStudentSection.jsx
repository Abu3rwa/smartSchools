export default function AttendanceRequestStudentSection({
  formData,
  setFormDataField,
  eligibleStudents,
}) {
  return (
    <div className="form-section">
      <h2 className="section-title">Student</h2>
      <div className="form-row">
        <label className="field-label">Select student (optional)</label>
        <select
          className="form-select"
          value={formData.student}
          onChange={(e) => setFormDataField("student", e.target.value)}
        >
          <option value="">— Select —</option>
          {eligibleStudents.map((s) => (
            <option key={s._id} value={s._id}>
              {s.firstName} {s.lastName}{" "}
              {s.studentId ? `(${s.studentId})` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
