import { Link } from 'react-router-dom';
import { HiOutlineClock } from 'react-icons/hi';
import { formatDueDate } from '../utils/studentDashboardPresentation';
import { formatStandardLabel } from '../../../../../utils/standardLabel';

const UpcomingDueDatesCard = ({ upcomingAssignments, todayStart }) => {
    return (
        <section className="student-card due-card">
            <h2><HiOutlineClock className="card-icon" /> Upcoming Due Dates</h2>
            {upcomingAssignments.length === 0 ? (
                <p className="empty-text">No upcoming due dates.</p>
            ) : (
                <ul className="due-list">
                    {upcomingAssignments.map((assignment) => (
                        <li key={`${assignment.source}-${assignment.id || assignment._id}`} className="due-item">
                            <div className="due-item-main">
                                <span className="due-code">
                                    {assignment.source === 'practice'
                                        ? formatStandardLabel(assignment.standard) || assignment.standard?.code
                                        : assignment.assignmentType?.name || 'Assignment'}
                                </span>
                                <span className="due-date">{formatDueDate(assignment.due, todayStart)}</span>
                            </div>
                            <div className="due-item-action">
                                {assignment.source === 'practice' ? (
                                    <Link to={`/portal/practice/${assignment._id}`} className="link-sm">
                                        Practice
                                    </Link>
                                ) : (
                                    <Link
                                        to={`/portal/my-assignments/${assignment.id || assignment._id}`}
                                        className="link-sm"
                                    >
                                        See assignment
                                    </Link>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default UpcomingDueDatesCard;
