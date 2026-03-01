/**
 * Assignment header with standard info and mastery stats. Uses CSS class: history-header.
 */
export default function PracticeHistoryAssignmentHeader({ assignment, mastery }) {
    if (!assignment) return null;

    return (
        <div className="history-header">
            <span
                style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    color: 'var(--primary-600)',
                }}
            >
                {assignment.standard?.code}
            </span>
            <h2>{assignment.standard?.name}</h2>
            <p
                style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    marginTop: 4,
                }}
            >
                {assignment.standard?.description}
            </p>

            {mastery && (
                <div
                    style={{
                        marginTop: 'var(--spacing-md)',
                        display: 'flex',
                        gap: 'var(--spacing-lg)',
                        fontSize: '0.85rem',
                    }}
                >
                    <span>
                        Status:{' '}
                        <strong
                            style={{
                                color: mastery.isMastered
                                    ? 'var(--success-600, #059669)'
                                    : 'var(--warning-600, #d97706)',
                            }}
                        >
                            {mastery.isMastered ? 'Mastered' : 'In Progress'}
                        </strong>
                    </span>
                    <span>
                        Score: <strong>{mastery.correctCount}/{mastery.totalAttempts}</strong>
                    </span>
                    <span>
                        Accuracy: <strong>{mastery.percentage}%</strong>
                    </span>
                </div>
            )}
        </div>
    );
}
