import {
    HiOutlineBookOpen,
    HiOutlinePencil,
    HiOutlineTrash
} from 'react-icons/hi';
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
                    Retry
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
                            <button onClick={() => onEdit(subject)} className="btn-icon" title="Edit">
                                <HiOutlinePencil />
                            </button>
                            <button onClick={() => onDelete(subject._id)} className="btn-icon text-danger" title="Delete">
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
                            {subject.type}
                        </span>
                        <span className="marks-info">
                            Daily: {subject.dailyMaxMarks} | Max: {subject.maxMarks}
                        </span>
                    </div>
                </div>
            ))}
            {subjects.length === 0 && (
                <div className="empty-state">
                    <HiOutlineBookOpen size={48} />
                    <p>No subjects found</p>
                </div>
            )}
        </div>
    );
};

export default SubjectsTable;
