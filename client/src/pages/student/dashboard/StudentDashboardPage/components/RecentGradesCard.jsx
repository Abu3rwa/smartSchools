import { Link } from 'react-router-dom';
import { HiOutlineClipboardList } from 'react-icons/hi';

const RecentGradesCard = ({ grades }) => {
    return (
        <section className="student-card grades-card">
            <h2><HiOutlineClipboardList className="card-icon" /> Recent Grades</h2>
            <div className="card-action">
                <Link to="/portal/my-grades" className="link-sm">View all</Link>
            </div>
            {grades.length === 0 ? (
                <p className="empty-text">No grades yet.</p>
            ) : (
                <ul className="grades-list">
                    {grades.map((grade) => (
                        <li key={grade._id} className="grades-item">
                            <div className="grade-item-main">
                                <span className="grade-subject">{grade.subject?.name || 'Subject'}</span>
                                <span className="grade-date">
                                    {grade.date ? new Date(grade.date).toLocaleDateString() : '—'}
                                </span>
                            </div>
                            <div className="grade-marks-container">
                                <span className="grade-marks">{grade.marks}/{grade.maxMarks}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default RecentGradesCard;
