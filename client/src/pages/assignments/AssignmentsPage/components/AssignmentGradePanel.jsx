import { HiOutlineCheckCircle } from 'react-icons/hi';

const AssignmentGradePanel = ({
    gradingAssignment,
    gradeStudents,
    gradeRows,
    onGradeChange,
    onClose,
    onSubmitGrades
}) => {
    if (!gradingAssignment) return null;

    return (
        <div className="grade-panel card">
            <div className="card-header">
                <h3 className="card-title">Grade: {gradingAssignment.title}</h3>
                <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
            </div>

            <div className="table-container">
                <table className="assignment-table">
                    <thead>
                        <tr>
                            <th>Student</th>
                            <th>Marks</th>
                            <th>Remarks</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gradeStudents.map((student) => (
                            <tr key={student.id}>
                                <td>{student.fullName || `${student.firstName} ${student.lastName}`}</td>
                                <td>
                                    <input
                                        type="number"
                                        min={0}
                                        max={gradingAssignment.maxMarks}
                                        value={gradeRows[student.id]?.marks ?? ''}
                                        onChange={(event) => onGradeChange(student.id, 'marks', event.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        value={gradeRows[student.id]?.remarks ?? ''}
                                        onChange={(event) => onGradeChange(student.id, 'remarks', event.target.value)}
                                        placeholder="Optional"
                                    />
                                </td>
                                <td>
                                    {gradeRows[student.id]?.marks !== '' && gradeRows[student.id]?.marks !== undefined && (
                                        <HiOutlineCheckCircle className="status-icon success" />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="card-footer">
                <button type="button" className="btn btn-primary" onClick={onSubmitGrades}>
                    Save Assignment Grades
                </button>
            </div>
        </div>
    );
};

export default AssignmentGradePanel;
