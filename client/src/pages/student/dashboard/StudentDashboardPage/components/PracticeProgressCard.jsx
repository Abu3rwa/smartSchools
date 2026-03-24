import { Link } from 'react-router-dom';
import { HiOutlineLightningBolt, HiOutlinePlay } from 'react-icons/hi';
import { MAX_ASSIGNMENTS_DISPLAY } from '../constants';
import { formatStandardLabel } from '../../../../../utils/standardLabel';

const PracticeProgressCard = ({ 
    assignments, 
    title = "Practice Progress", 
    emptyText = "No standards assigned yet.",
    icon: Icon = HiOutlineLightningBolt
}) => {
    return (
        <section className="student-card practice-card">
            <h2><Icon className="card-icon" /> {title}</h2>
            <div className="card-action">
                <Link to="/portal/practice" className="link-sm">Go to Practice</Link>
            </div>
            {assignments.length === 0 ? (
                <p className="empty-text">{emptyText}</p>
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
                                            role="progressbar"
                                            aria-valuenow={assignment.mastery?.percentage ?? 0}
                                            aria-valuemin={0}
                                            aria-valuemax={100}
                                            aria-label={`${formatStandardLabel(assignment.standard) || assignment.standard?.code} — ${assignment.mastery?.percentage ?? 0}% complete`}
                                            style={{ width: `${assignment.mastery?.percentage || 0}%` }}
                                        />
                                    </div>
                                    <span className="practice-pct">{assignment.mastery?.percentage ?? 0}%</span>
                                </div>
                            </div>
                            <div className="practice-item-action">
                                {(() => {
                                    const isAssessment = assignment.practiceConfig?.sessionType === 'assessment';
                                    const assessmentComplete = Boolean(assignment.assessmentProgress?.isComplete);

                                    if (isAssessment) {
                                        if (assessmentComplete) {
                                            return <span className="badge-mastered">Completed</span>;
                                        }
                                        return (
                                            <Link to={`/portal/practice/${assignment._id}`} className="btn-sm btn-primary">
                                                <HiOutlinePlay size={14} /> Start
                                            </Link>
                                        );
                                    }

                                    if (assignment.mastery?.isMastered) {
                                        return <span className="badge-mastered">Mastered</span>;
                                    }

                                    return (
                                        <Link to={`/portal/practice/${assignment._id}`} className="btn-sm btn-primary">
                                            <HiOutlinePlay size={14} /> Practice
                                        </Link>
                                    );
                                })()}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default PracticeProgressCard;
