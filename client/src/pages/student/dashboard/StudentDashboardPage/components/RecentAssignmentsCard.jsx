import { Link } from 'react-router-dom';
import { HiOutlineClipboardList } from 'react-icons/hi';
import { MAX_ASSIGNMENTS_DISPLAY } from '../constants';
import { formatStandardLabel } from '../../../../../utils/standardLabel';

const getAssignmentDate = (assignment) => {
    const value = assignment?.assignedDate || assignment?.publishedAt || assignment?.createdAt;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
};

const getPracticeType = (sessionType) => {
    switch (sessionType) {
        case 'assessment':
            return 'Graded Assessment';
        case 'homework':
            return 'Homework';
        case 'classwork':
            return 'Classwork';
        default:
            return 'Practice';
    }
};

const getRecentAssignments = (practiceAssignments, classAssignments) => {
    const linkedPracticeIds = new Set(
        classAssignments
            .map((assignment) => String(assignment?.practiceAssignmentId || ''))
            .filter(Boolean)
    );
    const practiceItems = practiceAssignments.map((assignment) => ({
        ...assignment,
        id: assignment?._id || assignment?.id,
        source: 'practice',
        displayTitle: assignment?.title || formatStandardLabel(assignment?.standard) || 'Practice assignment',
        displayType: getPracticeType(assignment?.practiceConfig?.sessionType),
    }));
    const classItems = classAssignments.map((assignment) => ({
        ...assignment,
        id: assignment?.id || assignment?._id,
        source: assignment?.practiceAssignmentId ? 'practice' : 'class_assignment',
        displayTitle: assignment?.title || 'Class assignment',
        displayType: assignment?.assignmentType?.name || 'Assignment',
    }));

    return [
        ...practiceItems.filter((assignment) => !linkedPracticeIds.has(String(assignment.id || ''))),
        ...classItems,
    ]
        .sort((a, b) => {
            const timeA = getAssignmentDate(a)?.getTime() || 0;
            const timeB = getAssignmentDate(b)?.getTime() || 0;
            return timeB - timeA;
        })
        .slice(0, MAX_ASSIGNMENTS_DISPLAY);
};

const RecentAssignmentsCard = ({ practiceAssignments = [], classAssignments = [] }) => {
    const assignments = getRecentAssignments(practiceAssignments, classAssignments);

    return (
        <section className="student-card recent-assignments-card">
            <h2><HiOutlineClipboardList className="card-icon" /> New Assignments</h2>
            <div className="card-action">
                <Link to="/portal/my-assignments" className="link-sm">All assignments</Link>
            </div>
            {assignments.length === 0 ? (
                <p className="empty-text">No assignments yet.</p>
            ) : (
                <ul className="recent-assignments-list">
                    {assignments.map((assignment) => {
                        const destination = assignment.source === 'practice'
                            ? `/portal/practice/${assignment.practiceAssignmentId || assignment.id}`
                            : `/portal/my-assignments/${assignment.id}`;
                        const assignedDate = getAssignmentDate(assignment);

                        return (
                            <li key={`${assignment.source}-${assignment.id}`} className="recent-assignment-item">
                                <div className="recent-assignment-main">
                                    <span className="recent-assignment-title">{assignment.displayTitle}</span>
                                    <span className="recent-assignment-type">
                                        {assignment.displayType}
                                        {assignedDate ? ` · Assigned ${assignedDate.toLocaleDateString()}` : ''}
                                    </span>
                                </div>
                                <Link to={destination} className="link-sm">
                                    Open
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

export default RecentAssignmentsCard;
