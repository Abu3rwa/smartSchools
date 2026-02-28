const StudentSelectionSection = ({ students, value, onChange }) => (
  <div className="form-section">
    <h3>Select Student</h3>
    <div className="form-group">
      <label htmlFor="studentId">Student</label>
      <select id="studentId" name="studentId" value={value} onChange={onChange} required>
        <option value="">Select a student...</option>
        {students.map((student) => (
          <option key={student._id} value={student._id}>
            {student.firstName} {student.lastName} - {student.studentId}
          </option>
        ))}
      </select>
    </div>
  </div>
);

export default StudentSelectionSection;