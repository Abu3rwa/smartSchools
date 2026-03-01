import LoadingState from './LoadingState';
import ErrorState from './ErrorState';

const StandardAssignProgressModal = ({
    show,
    onClose,
    assignmentProgressLoading,
    assignmentProgress,
    standardsError,
    onRetry,
    progressAssignmentId,
    getProgressStatusDisplay,
    getMasteryColor
}) => {
    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 650 }}>
                <div className="modal-header">
                    <h3>Student Progress</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className="modal-body">
                    {assignmentProgressLoading ? (
                        <LoadingState />
                    ) : !assignmentProgress ? (
                        <ErrorState
                            message={standardsError || 'Unable to load progress for this assignment.'}
                            onRetry={onRetry}
                            disableRetry={!progressAssignmentId}
                        />
                    ) : (
                        <>
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <strong>{assignmentProgress.assignment?.standard?.name}</strong>
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: '0.82rem',
                                        color: 'var(--text-muted)'
                                    }}
                                >
                                    ({assignmentProgress.assignment?.standard?.code})
                                </span>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 'var(--spacing-lg)',
                                    marginBottom: 'var(--spacing-md)',
                                    fontSize: '0.85rem'
                                }}
                            >
                                <span>
                                    Total: <strong>{assignmentProgress.summary?.totalStudents}</strong>
                                </span>
                                <span style={{ color: 'var(--success-600, #059669)' }}>
                                    Mastered: <strong>{assignmentProgress.summary?.mastered}</strong>
                                </span>
                                <span style={{ color: 'var(--warning-600, #d97706)' }}>
                                    In Progress: <strong>{assignmentProgress.summary?.inProgress}</strong>
                                </span>
                                <span style={{ color: 'var(--error-600, #b91c1c)' }}>
                                    Needs Review:{' '}
                                    <strong>{assignmentProgress.summary?.needsReview || 0}</strong>
                                </span>
                                <span>
                                    Not Started: <strong>{assignmentProgress.summary?.notStarted}</strong>
                                </span>
                            </div>
                            <div className="progress-list">
                                {assignmentProgress.studentsProgress?.map((studentProgress) => {
                                    const status = getProgressStatusDisplay(
                                        studentProgress.progressStatus
                                    );
                                    return (
                                        <div
                                            key={studentProgress.student._id}
                                            className="progress-row"
                                        >
                                            <span className="progress-student-name">
                                                {studentProgress.student.firstName}{' '}
                                                {studentProgress.student.lastName}
                                            </span>
                                            <div className="progress-stats">
                                                <span className={`mastery-badge ${status.className}`}>
                                                    {status.label}
                                                </span>
                                                <span>
                                                    {studentProgress.mastery.correctCount}/
                                                    {studentProgress.mastery.totalAttempts} correct
                                                </span>
                                                <div className="progress-bar-mini">
                                                    <div
                                                        className={`fill ${getMasteryColor(
                                                            studentProgress.mastery.percentage
                                                        )}`}
                                                        style={{
                                                            width: `${studentProgress.mastery.percentage}%`
                                                        }}
                                                    ></div>
                                                </div>
                                                <span>{studentProgress.mastery.percentage}%</span>
                                                {studentProgress.mastery.isMastered && (
                                                    <span className="mastery-badge mastered">
                                                        Mastered
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StandardAssignProgressModal;
