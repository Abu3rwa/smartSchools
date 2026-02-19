import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
    fetchPracticeHistory, fetchMyAssignments,
    selectPracticeHistory, selectHistoryMastery, selectMyAssignments, selectPracticeLoading,
    clearPracticeHistory
} from '../store/slices/practiceSlice';
import { selectCurrentAcademicYear } from '../store/slices/uiSlice';
import { HiOutlineArrowLeft, HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';
import './PracticeHistoryPage.css';

const PracticeHistoryPage = () => {
    const { assignmentId } = useParams();
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const history = useSelector(selectPracticeHistory);
    const mastery = useSelector(selectHistoryMastery);
    const assignments = useSelector(selectMyAssignments);
    const loading = useSelector(selectPracticeLoading);
    const academicYear = useSelector(selectCurrentAcademicYear);

    const [assignment, setAssignment] = useState(null);

    useEffect(() => {
        if (!assignments.length) {
            dispatch(fetchMyAssignments());
        }
    }, [dispatch, assignments.length, academicYear]);

    useEffect(() => {
        if (assignments.length) {
            const found = assignments.find(a => a._id === assignmentId);
            if (found) {
                setAssignment(found);
                dispatch(fetchPracticeHistory({ standardId: found.standard._id }));
            }
        }
        return () => { dispatch(clearPracticeHistory()); };
    }, [dispatch, assignmentId, assignments, academicYear]);

    return (
        <div className="practice-history">
            <button className="back-link" onClick={() => navigate('/portal/practice')}>
                <HiOutlineArrowLeft size={16} /> Back to Practice Dashboard
            </button>

            {assignment && (
                <div className="history-header">
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--primary-600)' }}>
                        {assignment.standard?.code}
                    </span>
                    <h2>{assignment.standard?.name}</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {assignment.standard?.description}
                    </p>

                    {mastery && (
                        <div style={{ marginTop: 'var(--spacing-md)', display: 'flex', gap: 'var(--spacing-lg)', fontSize: '0.85rem' }}>
                            <span>
                                Status: <strong style={{ color: mastery.isMastered ? 'var(--success-600, #059669)' : 'var(--warning-600, #d97706)' }}>
                                    {mastery.isMastered ? 'Mastered' : 'In Progress'}
                                </strong>
                            </span>
                            <span>Score: <strong>{mastery.correctCount}/{mastery.totalAttempts}</strong></span>
                            <span>Accuracy: <strong>{mastery.percentage}%</strong></span>
                        </div>
                    )}
                </div>
            )}

            {loading ? (
                <div className="loading-container"><div className="spinner"></div></div>
            ) : history.length === 0 ? (
                <div className="history-empty">
                    <p>No practice attempts yet for this standard.</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/portal/practice/${assignmentId}`)}
                        style={{ marginTop: 'var(--spacing-md)' }}
                    >
                        Start Practicing
                    </button>
                </div>
            ) : (
                <div className="history-list">
                    {history.map((item) => (
                        <div key={item._id} className={`history-item ${item.isCorrect ? 'correct' : 'incorrect'}`}>
                            <div className="history-item-header">
                                <span className="attempt-num">
                                    {item.isCorrect
                                        ? <HiOutlineCheckCircle size={16} style={{ color: 'var(--success-500, #10b981)', verticalAlign: 'middle', marginRight: 4 }} />
                                        : <HiOutlineXCircle size={16} style={{ color: 'var(--danger-500, #ef4444)', verticalAlign: 'middle', marginRight: 4 }} />
                                    }
                                    Attempt #{item.attemptNumber} - {item.difficulty}
                                </span>
                                <span className="attempt-date">
                                    {item.answeredAt ? new Date(item.answeredAt).toLocaleString() : '-'}
                                    {item.timeSpentSeconds > 0 && ` (${item.timeSpentSeconds}s)`}
                                </span>
                            </div>
                            <div className="history-question">{item.questionText}</div>
                            <div className="history-answers">
                                <div>
                                    <span className="label">Your Answer: </span>
                                    <span style={{ color: item.isCorrect ? 'var(--success-600, #059669)' : 'var(--danger-600, #dc2626)' }}>
                                        {item.studentAnswer}
                                    </span>
                                </div>
                                {!item.isCorrect && (
                                    <div>
                                        <span className="label">Correct: </span>
                                        <span style={{ color: 'var(--success-600, #059669)' }}>
                                            {item.correctAnswerDisplay || item.correctAnswer}
                                        </span>
                                    </div>
                                )}
                            </div>
                            {(item.feedbackParts?.explanation || item.feedbackParts?.reasonSummary || item.explanation) && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                                    {item.feedbackParts?.explanation || item.feedbackParts?.reasonSummary || item.explanation}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default PracticeHistoryPage;
