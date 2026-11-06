const StudentSelectionSection = ({ students, classes = [], subjects = [], formData = {}, onChange }) => (
  <div className="rg-panel">
    <div className="rg-panel-head">
      <h3>Student & Subject</h3>
      <span className="rg-hint">Required</span>
    </div>
    <div className="rg-field">
      <label className="rg-label" htmlFor="classId">Class</label>
      <select id="classId" name="classId" className="rg-select" value={formData.classId || ''} onChange={onChange}>
        <option value="">All Classes</option>
        {classes.map((cls) => (
          <option key={cls._id} value={cls._id}>
            {cls.name}
          </option>
        ))}
      </select>
    </div>
    <div className="rg-field">
      <label className="rg-label" htmlFor="studentId">Student</label>
      <select
        id="studentId"
        name="studentId"
        className="rg-select"
        value={formData.studentId || ''}
        onChange={onChange}
        required
      >
        <option value="">Select a student...</option>
        {students.map((student) => (
          <option key={student._id} value={student._id}>
            {student.firstName} {student.lastName} – {student.studentId}
          </option>
        ))}
      </select>
    </div>
    <div className="rg-field">
      <label className="rg-label" htmlFor="subjectId">Subject</label>
      <select
        id="subjectId"
        name="subjectId"
        className="rg-select"
        value={formData.subjectId || ''}
        onChange={onChange}
      >
        <option value="">All Subjects (General Report)</option>
        {subjects.map((subject) => (
          <option key={subject._id} value={subject._id}>
            {subject.name}
          </option>
        ))}
      </select>
    </div>
  </div>
);

export default StudentSelectionSection;
