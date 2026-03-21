import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import { useTranslation } from 'react-i18next';

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
    const { t } = useTranslation(['standardAssign']);
    const isAssessmentMode = assignmentProgress?.assignment?.practiceConfig?.sessionType === 'assessment';

    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 650 }}>
                <div className="modal-header">
                    <h3>{t('standardAssign:progress.title')}</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className="modal-body">
                    {assignmentProgressLoading ? (
                        <LoadingState />
                    ) : !assignmentProgress ? (
                        <ErrorState
                            message={standardsError || t('standardAssign:error.unableToLoadProgress')}
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
                                    {t('standardAssign:progress.total')} <strong>{assignmentProgress.summary?.totalStudents}</strong>
                                </span>
                                <span style={{ color: 'var(--success-600, #059669)' }}>
                                    {t('standardAssign:progress.mastered')} <strong>{assignmentProgress.summary?.mastered}</strong>
                                </span>
                                <span style={{ color: 'var(--warning-600, #d97706)' }}>
                                    {t('standardAssign:progress.inProgress')} <strong>{assignmentProgress.summary?.inProgress}</strong>
                                </span>
                                <span style={{ color: 'var(--error-600, #b91c1c)' }}>
                                    {t('standardAssign:progress.needsReview')}{' '}
                                    <strong>{assignmentProgress.summary?.needsReview || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:progress.notStarted')} <strong>{assignmentProgress.summary?.notStarted}</strong>
                                </span>
                            </div>
                            <div className="progress-list">
                                {assignmentProgress.studentsProgress?.map((studentProgress) => {
                                    const assessmentProgress = studentProgress.assessmentProgress || null;
                                    const mastery = studentProgress.mastery || {};

                                    const answeredCount = Number(
                                        isAssessmentMode
                                            ? (assessmentProgress?.totalAnswered ?? mastery.totalAttempts ?? studentProgress.totalAttempts ?? 0)
                                            : (mastery.totalAttempts ?? studentProgress.totalAttempts ?? 0)
                                    );
                                    const correctCount = Number(
                                        isAssessmentMode
                                            ? (assessmentProgress?.correctCount ?? mastery.correctCount ?? 0)
                                            : (mastery.correctCount ?? 0)
                                    );
                                    const computedPercentage = answeredCount > 0
                                        ? Math.round((correctCount / answeredCount) * 100)
                                        : 0;
                                    const displayPercentage = Number.isFinite(computedPercentage)
                                        ? Math.max(0, Math.min(100, computedPercentage))
                                        : 0;
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
                                                    {correctCount}/{answeredCount} {t('standardAssign:progress.correct')}
                                                </span>
                                                <div className="progress-bar-mini">
                                                    <div
                                                        className={`fill ${getMasteryColor(
                                                            displayPercentage
                                                        )}`}
                                                        style={{
                                                            width: `${displayPercentage}%`
                                                        }}
                                                    ></div>
                                                </div>
                                                <span>{displayPercentage}%</span>
                                                {(isAssessmentMode
                                                    ? assessmentProgress?.isComplete
                                                    : mastery.isMastered) && (
                                                    <span className="mastery-badge mastered">
                                                        {t('standardAssign:progress.masteredBadge')}
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
