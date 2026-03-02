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
                        <li key={assignment._id} className="due-item">
                            <span className="due-code">
                                {formatStandardLabel(assignment.standard) || assignment.standard?.code}
                            </span>
                            <span className="due-date">{formatDueDate(assignment.due, todayStart)}</span>
                            <Link to={`/portal/practice/${assignment._id}`} className="link-sm">
                                Practice
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default UpcomingDueDatesCard;
