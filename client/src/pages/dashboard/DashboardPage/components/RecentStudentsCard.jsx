import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const RecentStudentsCard = ({ students }) => {
    const { t } = useTranslation(['dashboard']);

    return (
        <div className="card recent-students-card">
            <div className="card-header dashboard-card-header">
                <h3 className="card-title">{t('dashboard:recentStudents.title')}</h3>
                <Link to="/portal/students" className="btn btn-ghost btn-sm">{t('dashboard:common.viewAll')}</Link>
            </div>
            <div className="students-list">
                {students.slice(0, 5).map((student, index) => (
                    <Link
                        key={student._id}
                        to={`/portal/students/${student._id}`}
                        className="student-item animate-fadeIn"
                        style={{ animationDelay: `${index * 0.05}s` }}
                    >
                        <div className="student-avatar">
                            {student.firstName?.charAt(0)}{student.lastName?.charAt(0)}
                        </div>
                        <div className="student-info">
                            <span className="student-name">{student.firstName} {student.lastName}</span>
                            <span className="student-id">{student.studentId}</span>
                        </div>
                        <span className="student-class">{student.currentClass?.name || t('dashboard:common.unassigned')}</span>
                    </Link>
                ))}
                {students.length === 0 && (
                    <p className="empty-message">{t('dashboard:recentStudents.empty')}</p>
                )}
            </div>
        </div>
    );
};

export default RecentStudentsCard;
