import { HiOutlineCheckCircle } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AssignmentGradePanel = ({
    gradingAssignment,
    gradeStudents,
    gradeRows,
    onGradeChange,
    onToggleExcuse,
    excuseBusyStudentId,
    onClose,
    onSubmitGrades,
    submitting = false,
    showBehaviorAction = false,
    onOpenBehavior
}) => {
    const { t } = useTranslation(['assignments']);
    if (!gradingAssignment) return null;

    const linkedLessons = Array.isArray(gradingAssignment.lessonPlans)
        ? gradingAssignment.lessonPlans
        : [];

    return (
        <div className="grade-panel card">
            <div className="card-header">
                <h3 className="card-title">{t('assignments:gradePanel.title', { title: gradingAssignment.title })}</h3>
                <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('assignments:common.close')}</button>
            </div>

            {linkedLessons.length > 0 && (
                <div className="card-body">
                    <strong>{t('assignments:gradePanel.linkedLessons', { defaultValue: 'Linked lesson plans:' })}</strong>{' '}
                    {linkedLessons.map((lesson) => lesson.title || lesson.id).join(', ')}
                </div>
            )}

            <div className="table-container">
                <table className="assignment-table">
                    <thead>
                        <tr>
                            <th>{t('assignments:gradePanel.columns.student')}</th>
                            <th>{t('assignments:gradePanel.columns.marks')}</th>
                            <th>{t('assignments:gradePanel.columns.remarks')}</th>
                            {showBehaviorAction && <th>Behavior</th>}
                            <th>{t('assignments:gradePanel.columns.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gradeStudents.map((student) => {
                            const row = gradeRows[student.id] || {};
                            const isExcused = row.excused === true;
                            const isBusy = excuseBusyStudentId === student.id;
                            const hasMarks = row.marks !== '' && row.marks !== null && row.marks !== undefined;

                            return (
                                <tr key={student.id} className={isExcused ? 'grade-row--excused' : undefined}>
                                    <td>{student.fullName || `${student.firstName} ${student.lastName}`}</td>
                                    <td>
                                        <input
                                            type="number"
                                            min={0}
                                            max={gradingAssignment.maxMarks}
                                            value={row.marks ?? ''}
                                            onChange={(event) => onGradeChange(student.id, 'marks', event.target.value)}
                                            disabled={isExcused}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={row.remarks ?? ''}
                                            onChange={(event) => onGradeChange(student.id, 'remarks', event.target.value)}
                                            placeholder={t('assignments:gradePanel.optional')}
                                            disabled={isExcused}
                                        />
                                    </td>
                                    {showBehaviorAction && (
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-outline btn-sm"
                                                onClick={() => onOpenBehavior(student)}
                                                disabled={isExcused}
                                            >
                                                Score behavior
                                            </button>
                                        </td>
                                    )}
                                    <td>
                                        {isExcused ? (
                                            <div className="grade-excused">
                                                <span className="grade-excused__badge">{t('assignments:gradePanel.excused')}</span>
                                                {onToggleExcuse && (
                                                    <button
                                                        type="button"
                                                        className="grade-excused__undo"
                                                        onClick={() => onToggleExcuse(student)}
                                                        disabled={isBusy}
                                                    >
                                                        {isBusy ? t('assignments:gradePanel.saving') : t('assignments:gradePanel.undoExcuse')}
                                                    </button>
                                                )}
                                            </div>
                                        ) : hasMarks ? (
                                            <HiOutlineCheckCircle className="status-icon success" />
                                        ) : onToggleExcuse ? (
                                            <button
                                                type="button"
                                                className="btn btn-outline btn-sm"
                                                onClick={() => onToggleExcuse(student)}
                                                disabled={isBusy}
                                            >
                                                {isBusy ? t('assignments:gradePanel.saving') : t('assignments:gradePanel.excuse')}
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <p className="assignment-grade-hint">{t('assignments:gradePanel.excuseHint')}</p>

            <div className="card-footer">
                <button type="button" className="btn btn-primary" onClick={onSubmitGrades} disabled={submitting}>
                    {submitting ? t('assignments:gradePanel.saving', { defaultValue: 'Saving…' }) : t('assignments:gradePanel.save')}
                </button>
            </div>
        </div>
    );
};

export default AssignmentGradePanel;
