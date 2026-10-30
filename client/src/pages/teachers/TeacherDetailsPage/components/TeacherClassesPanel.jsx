import { HiOutlineTrash, HiOutlineUserGroup } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { TEACHER_DETAILS_MESSAGES } from '../constants';
import { sortAssignments } from '../../TeachersPage/utils/teacherPresentation';

const TeacherClassesPanel = ({ teacher, canManageTeachers, onRemoveAssignment }) => {
    const { t } = useTranslation(['teachers', 'common']);

    const assignments = sortAssignments(teacher?.assignedClasses);

    return (
        <div className="profile-grid" style={{ paddingTop: 0 }}>
            <div className="info-section">
                <h3><HiOutlineUserGroup /> Class Assignments</h3>
                <div className="assignments-list">
                    {assignments.length > 0 ? (
                        assignments.map((assignment) => (
                            <div key={assignment._id} className="assignment-card">
                                <div className="assignment-header">
                                    <h4>{assignment.class?.name}</h4>
                                    {assignment.isClassTeacher && (
                                        <span className="class-teacher-badge">Class Teacher</span>
                                    )}
                                </div>
                                <div className="assignment-details-row">
                                    <div className="assignment-details">
                                        <span className="subject-name">{assignment.subject?.name}</span>
                                        <span className="academic-year">{assignment.class?.academicYear}</span>
                                    </div>
                                    {canManageTeachers && (
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-danger"
                                            onClick={() => onRemoveAssignment?.(assignment._id)}
                                        >
                                            <HiOutlineTrash size={14} /> {t('common:actions.remove')}
                                        </button>
                                    )}
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
