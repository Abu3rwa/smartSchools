import LoadingState from './LoadingState';
import ErrorState from './ErrorState';
import { useTranslation } from 'react-i18next';

const AssessmentGradebookModal = ({
    show,
    onClose,
    assessmentGradebookLoading,
    assessmentGradebookError,
    assessmentGradebookData,
    assessmentStandardAverageLoading,
    assessmentStandardAverageError,
    assessmentStandardAverageData,
    assessmentGradebookAssignmentId,
    releasingAssessmentResults,
    onRetry,
    onRelease
}) => {
    const { t, i18n } = useTranslation(['standardAssign']);
    const locale = i18n.resolvedLanguage === 'ar' ? 'ar' : undefined;

    if (!show) return null;

    const releaseMode = assessmentGradebookData?.assignment?.assessmentConfig?.resultsVisibility;
    const isManualRelease = releaseMode === 'manual_release';
    const submittedCount = Number(assessmentGradebookData?.summary?.submitted || 0);
    const canRelease = isManualRelease && submittedCount > 0;
    const resultsReleaseAt = assessmentGradebookData?.assignment?.assessmentConfig?.resultsReleaseAt
        ? new Date(assessmentGradebookData.assignment.assessmentConfig.resultsReleaseAt).toLocaleString(locale)
        : null;

    const getRowStatusLabel = (status = '') => {
        const normalized = String(status || 'not_started').toLowerCase();
        return t(`standardAssign:progressStatus.${normalized}`, {
            defaultValue: normalized.replace(/_/g, ' ')
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 820 }}>
                <div className="modal-header">
                    <h3>{t('standardAssign:assessmentGradebook.title')}</h3>
                    <button className="modal-close" onClick={onClose}>
                        &times;
                    </button>
                </div>
                <div className="modal-body">
                    {assessmentGradebookLoading ? (
                        <LoadingState />
                    ) : assessmentGradebookError ? (
                        <ErrorState
                            message={assessmentGradebookError}
                            onRetry={onRetry}
                            disableRetry={!assessmentGradebookAssignmentId}
                        />
                    ) : !assessmentGradebookData ? (
                        <ErrorState emptyText={t('standardAssign:assessmentGradebook.noData')} />
                    ) : (
                        <>
                            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                <strong>
                                    {assessmentGradebookData.assignment?.title ||
                                        assessmentGradebookData.assignment?.standard?.name}
                                </strong>
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: '0.82rem',
                                        color: 'var(--text-muted)'
                                    }}
                                >
                                    (
                                    {assessmentGradebookData.assignment?.standard?.code ||
                                        t('standardAssign:assessmentGradebook.assessmentFallback')}
                                    )
                                </span>
                                <p className="text-muted" style={{ marginTop: 6 }}>
                                    {t('standardAssign:assessmentGradebook.subtitle')}
                                </p>
                                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                                    {t('standardAssign:assessmentGradebook.resultsMode')}{' '}
                                    <strong>
                                        {isManualRelease
                                            ? t('standardAssign:assessmentGradebook.manualRelease')
                                            : t('standardAssign:assessmentGradebook.immediateVisibility')}
                                    </strong>
                                    {resultsReleaseAt ? (
                                        <span style={{ marginLeft: 8 }}>
                                            {t('standardAssign:assessmentGradebook.releaseAt')} <strong>{resultsReleaseAt}</strong>
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 'var(--spacing-lg)',
                                    marginBottom: 'var(--spacing-md)',
                                    fontSize: '0.85rem',
                                    flexWrap: 'wrap'
                                }}
                            >
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.total')}{' '}
                                    <strong>
                                        {assessmentGradebookData.summary?.totalStudents || 0}
                                    </strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.released')}{' '}
                                    <strong>{assessmentGradebookData.summary?.released || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.submitted')}{' '}
                                    <strong>{assessmentGradebookData.summary?.submitted || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.inProgress')}{' '}
                                    <strong>{assessmentGradebookData.summary?.inProgress || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.notStarted')}{' '}
                                    <strong>{assessmentGradebookData.summary?.notStarted || 0}</strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.avgPercentage')}{' '}
                                    <strong>
                                        {assessmentGradebookData.summary?.averagePercentage || 0}
                                    </strong>
                                </span>
                                <span>
                                    {t('standardAssign:assessmentGradebook.summary.avgScale')}{' '}
                                    <strong>{assessmentGradebookData.summary?.averageScale4 || 0}</strong>
                                </span>
                            </div>

                            <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}>
                                <table className="practice-table">
                                    <thead>
                                        <tr>
                                            <th>{t('standardAssign:assessmentGradebook.table.student')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.status')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.answered')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.score')}</th>
                                            <th>{t('standardAssign:assessmentGradebook.table.percentage')}</th>
                                            <th>0-4</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(assessmentGradebookData.rows || []).map((row) => (
                                            <tr key={row.student?._id || row.student?.studentId}>
                                                <td>
                                                    {row.student?.firstName} {row.student?.lastName}
                                                </td>
                                                <td>
                                                    {getRowStatusLabel(row.status)}
                                                </td>
                                                <td>{row.totalAnswered ?? 0}</td>
                                                <td>
                                                    {row.score !== null && row.score !== undefined
                                                        ? `${row.score}/${row.maxScore || 100}`
                                                        : t('standardAssign:common.na')}
                                                </td>
                                                <td>
                                                    {row.percentage !== null &&
                                                    row.percentage !== undefined
                                                        ? `${row.percentage}%`
                                                        : t('standardAssign:common.na')}
                                                </td>
                                                <td>
                                                    {row.scale4 !== null && row.scale4 !== undefined
                                                        ? row.scale4
                                                        : t('standardAssign:common.na')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ marginTop: 'var(--spacing-lg)' }}>
                                <h4 style={{ margin: '0 0 8px' }}>
                                    {t('standardAssign:assessmentGradebook.standardAverageTitle')}
                                </h4>
                                {assessmentStandardAverageLoading ? (
                                    <p className="text-muted">{t('standardAssign:assessmentGradebook.loadingStandardAverage')}</p>
                                ) : assessmentStandardAverageError ? (
                                    <p className="text-danger">{assessmentStandardAverageError}</p>
                                ) : (
                                    <div className="table-container" style={{ maxHeight: 260, overflow: 'auto' }}>
                                        <table className="practice-table">
                                            <thead>
                                                <tr>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.student')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.attempts')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.graded')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.averagePercentage')}</th>
                                                    <th>{t('standardAssign:assessmentGradebook.averageTable.averageScale')}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(assessmentStandardAverageData?.rows || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5}>{t('standardAssign:assessmentGradebook.noRepeatedData')}</td>
                                                    </tr>
                                                ) : (
                                                    (assessmentStandardAverageData?.rows || []).map((row) => (
                                                        <tr
                                                            key={
                                                                row.student?._id ||
                                                                row.student?.studentId ||
                                                                JSON.stringify(row.student)
                                                            }
                                                        >
                                                            <td>
                                                                {row.student?.firstName} {row.student?.lastName}
                                                            </td>
                                                            <td>{row.attemptCount ?? 0}</td>
                                                            <td>{row.gradedAttemptCount ?? 0}</td>
                                                            <td>
                                                                {row.averagePercentage !== null &&
                                                                row.averagePercentage !== undefined
                                                                    ? `${row.averagePercentage}%`
                                                                    : t('standardAssign:common.na')}
                                                            </td>
                                                            <td>
                                                                {row.averageScale4 !== null &&
                                                                row.averageScale4 !== undefined
                                                                    ? row.averageScale4
                                                                    : t('standardAssign:common.na')}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={onRetry}
                        disabled={!assessmentGradebookAssignmentId || assessmentGradebookLoading}
                    >
                        {t('standardAssign:actions.refresh')}
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onRelease}
                        disabled={
                            !assessmentGradebookAssignmentId ||
                            releasingAssessmentResults ||
                            assessmentGradebookLoading ||
                            !canRelease
                        }
                        title={
                            !isManualRelease
                                ? t('standardAssign:assessmentGradebook.releaseDisabledImmediate')
                                : submittedCount <= 0
                                  ? t('standardAssign:assessmentGradebook.releaseDisabledNoSubmitted')
                                  : ''
                        }
                    >
                        {releasingAssessmentResults
                            ? t('standardAssign:actions.releasing')
                            : t('standardAssign:actions.releaseResults')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssessmentGradebookModal;
