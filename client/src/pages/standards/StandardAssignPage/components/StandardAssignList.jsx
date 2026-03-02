import {
    HiOutlineAcademicCap,
    HiOutlineBookOpen,
    HiOutlineCalendar,
    HiOutlineEye,
    HiOutlinePencilAlt,
    HiOutlineTrash,
    HiOutlineUserGroup
} from 'react-icons/hi';
import LoadingState from './LoadingState';
import { formatStandardLabel } from '../../../../utils/standardLabel';

const StandardAssignList = ({
    loading,
    assignments,
    academicYear,
    selectedSemester,
    isAdmin,
    user,
    onViewProgress,
    onEdit,
    onViewAssessmentGradebook,
    onDelete,
    getStandardDescription
}) => {
    if (loading && !assignments.length) {
        return <LoadingState />;
    }

    if (assignments.length === 0) {
        return (
            <div className="assign-empty">
                <HiOutlineAcademicCap size={48} />
                <p>No standard assignments yet</p>
                <p style={{ fontSize: '0.85rem' }}>
                    Click "New Assignment" to assign a standard to your class.
                </p>
            </div>
        );
    }

    return (
        <div className="assign-cards">
            {assignments.map((assignment) => (
                <div key={assignment._id} className="assign-card">
                    <div className="assign-card-header">
                        <div>
                            <span
                                className="text-muted"
                                style={{ fontSize: '0.78rem', fontWeight: 600 }}
                            >
                                {assignment.title || `${assignment.standard?.code} Assignment`}
                            </span>
                            <span className="standard-code">
                                {formatStandardLabel(assignment.standard) || assignment.standard?.code}
                            </span>
                        </div>
                    </div>
                    <div className="assign-card-body">
                        {getStandardDescription(assignment.standard).substring(0, 100)}
                        {getStandardDescription(assignment.standard).length > 100 ? '...' : ''}
                    </div>
                    <div className="assign-card-meta">
                        <span>
                            <HiOutlineBookOpen size={14} /> {assignment.subject?.name}
                        </span>
                        <span>
                            <HiOutlineAcademicCap size={14} /> {assignment.class?.name || 'Class'}
                        </span>
                        <span>
                            <HiOutlineUserGroup size={14} /> {assignment.students?.length || 'All'} students
                        </span>
                        <span>
                            <HiOutlineBookOpen size={14} /> Mode:{' '}
                            {assignment.practiceConfig?.sessionType === 'assessment'
                                ? 'Graded Assessment'
                                : 'Practice'}
                        </span>
                        <span>
                            <HiOutlineCalendar size={14} /> AY: {assignment.academicYear || academicYear}
                        </span>
                        <span>
                            <HiOutlineCalendar size={14} /> Semester:{' '}
                            {assignment.semester || selectedSemester || 1}
                        </span>
                        {assignment.dueDate && (
                            <span>
                                <HiOutlineCalendar size={14} /> Due:{' '}
                                {new Date(assignment.dueDate).toLocaleDateString()}
                            </span>
                        )}
                        {user?.role === 'teacher' &&
                            assignment.teacher?.user?._id !== user?._id &&
                            assignment.teacher?.user !== user?._id && (
                                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                                    Admin assigned
                                </span>
                            )}
                    </div>
                    <div className="assign-card-footer">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onViewProgress(assignment._id)}
                        >
                            <HiOutlineEye size={16} /> View Progress
                        </button>
                        {(isAdmin ||
                            assignment.teacher?.user?._id === user?._id ||
                            assignment.teacher?.user === user?._id) && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onEdit(assignment)}
                            >
                                <HiOutlinePencilAlt size={16} /> Edit
                            </button>
                        )}
                        {assignment.practiceConfig?.sessionType === 'assessment' && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => onViewAssessmentGradebook(assignment._id)}
                            >
                                <HiOutlineEye size={16} /> SB Gradebook
                            </button>
                        )}
                        {(isAdmin ||
                            assignment.teacher?.user?._id === user?._id ||
                            assignment.teacher?.user === user?._id) && (
                            <button
                                className="btn-icon text-danger"
                                onClick={() => onDelete(assignment._id)}
                                title="Remove"
                            >
                                <HiOutlineTrash />
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StandardAssignList;
