import { Link } from 'react-router-dom';
import { HiOutlineLightningBolt, HiOutlinePlay } from 'react-icons/hi';
import { MAX_ASSIGNMENTS_DISPLAY } from '../constants';
import { formatStandardLabel } from '../../../../../utils/standardLabel';

const PracticeProgressCard = ({ assignments }) => {
    return (
        <section className="student-card practice-card">
            <h2><HiOutlineLightningBolt className="card-icon" /> Practice Progress</h2>
            <div className="card-action">
                <Link to="/portal/practice" className="link-sm">Go to Practice</Link>
            </div>
            {assignments.length === 0 ? (
                <p className="empty-text">No standards assigned yet.</p>
            ) : (
                <ul className="practice-list">
                    {assignments.slice(0, MAX_ASSIGNMENTS_DISPLAY).map((assignment) => (
                        <li key={assignment._id} className="practice-item">
                            <div className="practice-item-main">
                                <span className="practice-code">
                                    {formatStandardLabel(assignment.standard) || assignment.standard?.code}
                                </span>
                                <div className="practice-progress-container">
                                    <div className="practice-progress-bar">
                                        <div
                                            className="practice-progress-fill"
                                            style={{ width: `${assignment.mastery?.percentage || 0}%` }}
                                        />
                                    </div>
                                    <span className="practice-pct">{assignment.mastery?.percentage ?? 0}%</span>
                                </div>
                            </div>
                            <div className="practice-item-action">
                                {assignment.mastery?.isMastered ? (
                                    <span className="badge-mastered">Mastered</span>
                                ) : (
                                    <Link to={`/portal/practice/${assignment._id}`} className="btn-sm btn-primary">
                                        <HiOutlinePlay size={14} /> Practice
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

export default PracticeProgressCard;
