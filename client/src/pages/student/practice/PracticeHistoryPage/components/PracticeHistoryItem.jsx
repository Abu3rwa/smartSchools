import { HiOutlineCheckCircle, HiOutlineXCircle } from 'react-icons/hi';
import { formatAttemptDate, formatTimeSpent } from '../utils/practiceHistoryPresentation.js';

/**
 * Single history attempt item. Uses CSS: history-item, history-item-header, attempt-num, attempt-date, history-question, history-answers, label.
 */
export default function PracticeHistoryItem({ item }) {
    const iconStyle = { verticalAlign: 'middle', marginRight: 4 };
    const correctIcon = (
        <HiOutlineCheckCircle size={16} style={{ color: 'var(--success-500, #10b981)', ...iconStyle }} />
    );
    const incorrectIcon = (
        <HiOutlineXCircle size={16} style={{ color: 'var(--danger-500, #ef4444)', ...iconStyle }} />
    );

    const explanation =
        item.feedbackParts?.explanation ||
        item.feedbackParts?.reasonSummary ||
        item.explanation;

    return (
        <div
            key={item._id}
            className={`history-item ${item.isCorrect ? 'correct' : 'incorrect'}`}
        >
            <div className="history-item-header">
                <span className="attempt-num">
                    {item.isCorrect ? correctIcon : incorrectIcon}
                    Attempt #{item.attemptNumber} - {item.difficulty}
                </span>
                <span className="attempt-date">
                    {formatAttemptDate(item.answeredAt)}
                    {formatTimeSpent(item.timeSpentSeconds)}
                </span>
            </div>
            <div className="history-question">{item.questionText}</div>
            <div className="history-answers">
                <div>
                    <span className="label">Your Answer: </span>
                    <span
                        style={{
                            color: item.isCorrect
                                ? 'var(--success-600, #059669)'
                                : 'var(--danger-600, #dc2626)',
                        }}
                    >
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
            {explanation && (
                <p
                    style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-muted)',
                        marginTop: 6,
                        fontStyle: 'italic',
                    }}
                >
                    {explanation}
                </p>
            )}
        </div>
    );
}
