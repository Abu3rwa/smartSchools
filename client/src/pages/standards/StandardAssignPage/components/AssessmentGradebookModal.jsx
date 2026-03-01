import LoadingState from './LoadingState';
import ErrorState from './ErrorState';

const AssessmentGradebookModal = ({
    show,
    onClose,
    assessmentGradebookLoading,
    assessmentGradebookError,
    assessmentGradebookData,
    assessmentGradebookAssignmentId,
    releasingAssessmentResults,
    onRetry,
    onRelease
}) => {
    if (!show) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 820 }}>
                <div className="modal-header">
                    <h3>SB Gradebook (Standards-Based)</h3>
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
                        <ErrorState emptyText="No SB gradebook data found." />
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
                                        'Assessment'}
                                    )
                                </span>
                                <p className="text-muted" style={{ marginTop: 6 }}>
                                    Separate SB gradebook. This does not use the regular gradebook
                                    module.
                                </p>
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
                                    Total:{' '}
                                    <strong>
                                        {assessmentGradebookData.summary?.totalStudents || 0}
                                    </strong>
                                </span>
                                <span>
                                    Released:{' '}
                                    <strong>{assessmentGradebookData.summary?.released || 0}</strong>
                                </span>
                                <span>
                                    Submitted:{' '}
                                    <strong>{assessmentGradebookData.summary?.submitted || 0}</strong>
                                </span>
                                <span>
                                    In Progress:{' '}
                                    <strong>{assessmentGradebookData.summary?.inProgress || 0}</strong>
                                </span>
                                <span>
                                    Not Started:{' '}
                                    <strong>{assessmentGradebookData.summary?.notStarted || 0}</strong>
                                </span>
                                <span>
                                    Avg %:{' '}
                                    <strong>
                                        {assessmentGradebookData.summary?.averagePercentage || 0}
                                    </strong>
                                </span>
                                <span>
                                    Avg 0-4:{' '}
                                    <strong>{assessmentGradebookData.summary?.averageScale4 || 0}</strong>
                                </span>
                            </div>

                            <div className="table-container" style={{ maxHeight: 420, overflow: 'auto' }}>
                                <table className="practice-table">
                                    <thead>
                                        <tr>
                                            <th>Student</th>
                                            <th>Status</th>
                                            <th>Answered</th>
                                            <th>Score</th>
                                            <th>%</th>
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
                                                    {(row.status || 'not_started').replace('_', ' ')}
                                                </td>
                                                <td>{row.totalAnswered ?? 0}</td>
                                                <td>
                                                    {row.score !== null && row.score !== undefined
                                                        ? `${row.score}/${row.maxScore || 100}`
                                                        : '—'}
                                                </td>
                                                <td>
                                                    {row.percentage !== null &&
                                                    row.percentage !== undefined
                                                        ? `${row.percentage}%`
                                                        : '—'}
                                                </td>
                                                <td>
                                                    {row.scale4 !== null && row.scale4 !== undefined
                                                        ? row.scale4
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                        Refresh
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onRelease}
                        disabled={
                            !assessmentGradebookAssignmentId ||
                            releasingAssessmentResults ||
                            assessmentGradebookLoading
                        }
                    >
                        {releasingAssessmentResults ? 'Releasing...' : 'Release Results'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssessmentGradebookModal;
