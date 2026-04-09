const StudentSelectionSection = ({ students, classes = [], formData = {}, onChange }) => (
  <div className="form-section">
    <h3>Select Student</h3>
    <div className="form-group">
      <label htmlFor="classId">Class</label>
      <select id="classId" name="classId" value={formData.classId || ''} onChange={onChange}>
        <option value="">All Classes</option>
        {classes.map((cls) => (
          <option key={cls._id} value={cls._id}>
            {cls.name}
          </option>
        ))}
      </select>
    </div>
    <div className="form-group">
      <label htmlFor="studentId">Student</label>
      <select id="studentId" name="studentId" value={formData.studentId || ''} onChange={onChange} required>
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