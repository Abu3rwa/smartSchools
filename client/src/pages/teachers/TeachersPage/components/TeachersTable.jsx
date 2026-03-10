import {
    HiOutlineEye,
    HiOutlineMail,
    HiOutlinePencil,
    HiOutlineTrash,
    HiOutlineUserGroup
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { getTeacherFullName, getTeacherInitials } from '../utils/teacherPresentation';

const TeachersTable = ({
    loading,
    teachers,
    canManageTeachers,
    onView,
    onEdit,
    onAssign,
    onDelete
}) => {
    const { t } = useTranslation(['teachers']);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="table-container">
            <table className="data-table">
                <thead>
                        <tr>
                            <th>{t('teachers:table.columns.name')}</th>
                         
                        
                        <th>{t('teachers:table.columns.email')}</th>
                        <th>{t('teachers:table.columns.subjects')}</th>
                        <th>{t('teachers:table.columns.actions')}</th>
                    </tr>
                </thead>
                <tbody>
                    {teachers.map((teacher, index) => (
                        <tr key={teacher._id} className="animate-fadeIn" style={{ animationDelay: `${index * 0.05}s` }}>
                            <td>
                                <div className="teacher-name-cell">
                                    <div className="teacher-avatar">{getTeacherInitials(teacher)}</div>
                                    <span>{getTeacherFullName(teacher)}</span>
                                </div>
                            </td>
                           
                            <td>
                                <div className="contact-cell">
                                    <HiOutlineMail />
                                    <span>{teacher.user?.email}</span>
                                </div>
                            </td>
                            <td>
                                <div className="subjects-cell">
                                    {teacher.subjects?.slice(0, 3).map((subject) => (
                                        <span key={subject._id} className="subject-tag">{subject.code}</span>
                                    ))}
                                    {teacher.subjects?.length > 3 && (
                                        <span className="subject-tag more">+{teacher.subjects.length - 3}</span>
                                    )}
                                </div>
                            </td>
                            <td>
                                <div className="actions-cell">
                                    <button
                                        className="btn btn-sm btn-primary"
                                        onClick={() => onView(teacher)}
                                        title={t('teachers:actions.viewDetails')}
                                    >
                                        <HiOutlineEye size={16} />
                                        {t('common:actions.view')}
                                    </button>
                                    {canManageTeachers && (
                                        <>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => onEdit(teacher)}
                                                title={t('teachers:actions.editTeacher')}
                                            >
                                                <HiOutlinePencil size={16} />
                                                {t('common:actions.edit')}
                                            </button>
                                            <button
                                                className="btn btn-sm btn-ghost"
                                                onClick={() => onAssign(teacher)}
                                                title={t('teachers:actions.assignClasses')}
                                            >
                                                <HiOutlineUserGroup size={16} />
                                                {t('teachers:actions.assign')}
                                            </button>
                                            <button
                                                className="btn btn-sm btn-danger"
                                                onClick={() => onDelete(teacher)}
                                                title={t('teachers:actions.deleteTeacher')}
                                            >
                                                <HiOutlineTrash size={16} />
                                                {t('common:actions.delete')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {teachers.length === 0 && (
                <div className="empty-state">
                    <p>{t('teachers:empty.noTeachers')}</p>
                </div>
            )}
        </div>
    );
};

export default TeachersTable;
