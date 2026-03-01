import { HiOutlineUserGroup } from 'react-icons/hi';
import { TEACHER_DETAILS_MESSAGES } from '../constants';

const TeacherClassesPanel = ({ teacher }) => {
    return (
        <div className="profile-grid" style={{ paddingTop: 0 }}>
            <div className="info-section">
                <h3><HiOutlineUserGroup /> Class Assignments</h3>
                <div className="assignments-list">
                    {teacher?.assignedClasses?.length > 0 ? (
                        teacher.assignedClasses.map((assignment) => (
                            <div key={assignment._id} className="assignment-card">
                                <div className="assignment-header">
                                    <h4>{assignment.class?.name}</h4>
                                    {assignment.isClassTeacher && (
                                        <span className="class-teacher-badge">Class Teacher</span>
                                    )}
                                </div>
                                <div className="assignment-details">
                                    <span className="subject-name">{assignment.subject?.name}</span>
                                    <span className="academic-year">{assignment.class?.academicYear}</span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <p className="text-muted">{TEACHER_DETAILS_MESSAGES.NO_ASSIGNMENTS}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TeacherClassesPanel;
