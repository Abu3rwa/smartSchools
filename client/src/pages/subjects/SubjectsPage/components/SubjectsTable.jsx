import {
    HiOutlineBookOpen,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { getSubjectTypeBadge } from '../utils/subjectPresentation';

const SubjectsTable = ({
    loading,
    error,
    subjects,
    isAdmin,
    onRetry,
    onEdit,
    onDelete
}) => {
    const { t } = useTranslation(['subjects']);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="error-container">
                <p className="error-message">{error}</p>
                <button className="btn btn-primary" onClick={onRetry}>
                    {t('common:actions.retry')}
                </button>
            </div>
        );
    }

    return (
        <div className="subjects-grid">
            {subjects.map((subject, index) => (
                <div
                    key={subject._id}
                    className="subject-card animate-fadeIn"
                    style={{ animationDelay: `${index * 0.03}s` }}
                >
                    {isAdmin && (
                        <div className="subject-actions-overlay">
                            <button onClick={() => onEdit(subject)} className="btn-icon" title={t('common:actions.edit')}>
                                <HiOutlinePencil />
                            </button>
                            <button onClick={() => onDelete(subject._id)} className="btn-icon text-danger" title={t('common:actions.delete')}>
                                <HiOutlineTrash />
                            </button>
                        </div>
                    )}
                    <div className="subject-icon">
                        <HiOutlineBookOpen size={24} />
                    </div>
                    <div className="subject-main">
                        <h3>{subject.name}</h3>
                        <p className="subject-code">{subject.code}</p>
                    </div>
                    <div className="subject-meta">
                        <span className={`badge badge-${getSubjectTypeBadge(subject.type)}`}>
                            {t(`subjects:types.${subject.type}`)}
                        </span>
                        <span className="marks-info">
                            {t('subjects:table.marksInfo', { daily: subject.dailyMaxMarks, max: subject.maxMarks })}
                        </span>
                    </div>
                </div>
            ))}
            {subjects.length === 0 && (
                <div className="empty-state">
                    <HiOutlineBookOpen size={48} />
                    <p>{t('subjects:empty.noSubjects')}</p>
                </div>
            )}
        </div>
    );
};

export default SubjectsTable;
