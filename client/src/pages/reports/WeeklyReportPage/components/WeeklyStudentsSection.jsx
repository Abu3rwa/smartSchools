import { HiOutlineClipboardList } from 'react-icons/hi';
import { getStudentParentEmail } from '../utils/weeklyReportPresentation';

const WeeklyStudentsSection = ({ students }) => {
    return (
        <section className="report-section card">
            <div className="section-header">
                <HiOutlineClipboardList size={24} />
                <h2>Student List</h2>
            </div>

            <div className="students-grid">
                <p className="text-muted mb-md">
                    The weekly report sent to parents will include the lessons above and their child's specific classwork grades for this week.
                </p>
                <table className="report-table">
                    <thead>
                        <tr>
                            <th>Student Name</th>
                            <th>Parent Email</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {students.map((student) => (
                            <tr key={student._id}>
                                <td>
                                    <div className="student-cell">
                                        <div className="avatar-sm">
                                            {student.firstName?.charAt(0)}
                                            {student.lastName?.charAt(0)}
                                        </div>
                                        <span>{student.firstName} {student.lastName}</span>
                                    </div>
                                </td>
                                <td>{getStudentParentEmail(student)}</td>
                                <td><span className="badge badge-success">Active</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default WeeklyStudentsSection;
