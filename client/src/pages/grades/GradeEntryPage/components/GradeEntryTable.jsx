import {
    HiOutlineBell,
    HiOutlineCheckCircle,
    HiOutlineExclamationCircle,
    HiOutlineEye,
    HiOutlineSave,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';
import { getGradeMarkState } from '../utils/gradeEntryPresentation';

const GradeEntryTable = ({
    classStudents,
    grades,
    maxMarks,
    sendNotifications,
    onSendNotificationsChange,
    emailLanguageControl,
    onGradeChange,
    enteredCount,
    invalidCount = 0,
    readyCount = enteredCount,
    maxMarksValid = true,
    submitting,
    onSubmit,
    editMode = false,
    onCancelEdit,
    showBehaviorAction = false,
    onOpenBehavior,
    onPreviewStudent,
    onPreviewEmail
}) => {
    const { t } = useTranslation(['grades']);
    const remainingCount = Math.max(0, classStudents.length - enteredCount);
    const canSave = maxMarksValid && invalidCount === 0 && readyCount > 0;
    const progressPercent = classStudents.length > 0
        ? Math.round((enteredCount / classStudents.length) * 100)
        : 0;

    const saveHint = !maxMarksValid
        ? t('grades:entry.validation.maxMarksInvalid')
        : invalidCount > 0
            ? t('grades:entry.validation.fixInvalid', { count: invalidCount })
            : readyCount === 0
                ? t('grades:entry.table.enterOneToSave')
                : editMode
                    ? t('grades:entry.table.readyToUpdate', { count: readyCount })
                    : t('grades:entry.table.readyToSave', { count: readyCount });

    const handleMarkKeyDown = (event, index) => {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        const inputs = Array.from(event.currentTarget.form?.querySelectorAll('.marks-input') || []);
        inputs[index + 1]?.focus();
    };

    return (
        <form onSubmit={onSubmit} noValidate>
            <div className="card grade-entry-roster">
                <div
                    className="grade-roster-scroll"
                    role="region"
                    aria-label={t('grades:entry.table.regionLabel')}
                    tabIndex={0}
                >
                    <table className="grade-table">
                        <colgroup>
                            <col className="student-column" />
                            <col className="marks-column" />
                            <col className="remarks-column" />
                            {showBehaviorAction && <col className="behavior-column" />}
                            <col className="status-column" />
                        </colgroup>
                        <thead>
                            <tr>
                                <th scope="col" className="student-column">{t('grades:entry.table.columns.student')}</th>
                                <th scope="col" className="marks-column">{t('grades:entry.table.columns.marks', { maxMarks })}</th>
                                <th scope="col" className="remarks-column">{t('grades:entry.table.columns.remarks')}</th>
                                {showBehaviorAction && <th scope="col" className="behavior-column">{t('grades:entry.table.behavior')}</th>}
                                <th scope="col" className="status-column">{t('grades:entry.table.columns.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {classStudents.map((student, index) => {
                                const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim();
                                const markValue = grades[student._id]?.marks;
                                const markState = getGradeMarkState(markValue, maxMarks);
                                const previewValid = markState.status === 'valid';
                                const markInputId = `grade-mark-${student._id}`;
                                const markErrorId = `${markInputId}-error`;

                                return (
                                    <tr key={student._id} className={`grade-row is-${markState.status}`}>
                                        <td className="student-column">
                                            <div className="student-cell">
                                                <div className="avatar-sm" aria-hidden="true">
                                                    {student.firstName?.charAt(0)}
                                                    {student.lastName?.charAt(0)}
                                                </div>
                                                <div className="grade-student-copy">
                                                    <span className="grade-student-name">{studentName}</span>
                                                    {student.studentId && (
                                                        <span className="grade-student-id font-mono">{student.studentId}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="marks-column">
                                            <span className="mobile-field-label">{t('grades:entry.table.columns.marks', { maxMarks })}</span>
                                            <input
                                                id={markInputId}
                                                type="number"
                                                inputMode="decimal"
                                                className="marks-input"
                                                value={markValue ?? ''}
                                                onChange={(event) => onGradeChange(student._id, 'marks', event.target.value)}
                                                onFocus={(event) => event.currentTarget.select()}
                                                onKeyDown={(event) => handleMarkKeyDown(event, index)}
                                                min={0}
                                                max={maxMarks}
                                                step={0.01}
                                                placeholder="-"
                                                aria-label={t('grades:entry.table.markFor', { name: studentName })}
                                                aria-invalid={markState.status === 'invalid'}
                                                aria-describedby={markState.status === 'invalid' ? markErrorId : undefined}
                                            />
                                            {markState.status === 'invalid' && (
                                                <span id={markErrorId} className="grade-field-error">
                                                    {t('grades:entry.validation.markRange', { maxMarks })}
                                                </span>
                                            )}
                                        </td>
                                        <td className="remarks-column">
                                            <span className="mobile-field-label">{t('grades:entry.table.columns.remarks')}</span>
                                            <input
                                                type="text"
                                                className="remarks-input"
                                                value={grades[student._id]?.remarks || ''}
                                                onChange={(event) => onGradeChange(student._id, 'remarks', event.target.value)}
                                                placeholder={t('grades:entry.table.optional')}
                                                aria-label={t('grades:entry.table.remarksFor', { name: studentName })}
                                            />
                                        </td>
                                        {showBehaviorAction && (
                                            <td className="behavior-column">
                                                <span className="mobile-field-label">{t('grades:entry.table.behavior')}</span>
                                                <button type="button" className="btn btn-outline btn-sm behavior-button" onClick={() => onOpenBehavior(student)}>
                                                    {t('grades:entry.table.scoreBehavior')}
                                                </button>
                                            </td>
                                        )}
                                        <td className="status-column">
                                            <div className="status-cell">
                                                {markState.status === 'valid' && (
                                                    <span className="grade-row-status is-valid">
                                                        <HiOutlineCheckCircle size={17} aria-hidden="true" />
                                                        {t('grades:entry.table.entered')}
                                                    </span>
                                                )}
                                                {markState.status === 'invalid' && (
                                                    <span className="grade-row-status is-invalid">
                                                        <HiOutlineExclamationCircle size={17} aria-hidden="true" />
                                                        {t('grades:entry.table.checkMark')}
                                                    </span>
                                                )}
                                                {markState.status === 'empty' && (
                                                    <span className="grade-row-status is-empty" aria-label={t('grades:entry.table.notEntered')}>—</span>
                                                )}
                                                {onPreviewStudent && (
                                                    <button
                                                        type="button"
                                                        className="row-preview-icon"
                                                        onClick={() => onPreviewStudent(student)}
                                                        disabled={!previewValid}
                                                        aria-label={t('grades:entry.preview.rowLabel', { name: studentName })}
                                                        title={previewValid
                                                            ? t('grades:entry.lesson.previewEmail')
                                                            : t('grades:entry.preview.needsMark')}
                                                    >
                                                        <HiOutlineEye aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <footer className="card-footer grade-entry-footer">
                    <div className="grade-entry-progress">
                        <div className="grade-entry-progress-copy">
                            <strong>{enteredCount} / {classStudents.length}</strong>
                            <span>{t('grades:entry.table.enteredLabel')}</span>
                            {remainingCount > 0 && (
                                <span className="grade-entry-remaining">{t('grades:entry.table.remaining', { count: remainingCount })}</span>
                            )}
                        </div>
                        <div className="grade-progress-track" aria-hidden="true">
                            <span style={{ width: `${progressPercent}%` }} />
                        </div>
                        <p
                            className={`grade-save-hint${invalidCount > 0 || !maxMarksValid ? ' is-error' : ''}`}
                            role="status"
                        >
                            {saveHint}
                        </p>
                    </div>

                    <div className="grade-entry-footer-controls">
                        {!editMode && (
                            <div className="grade-email-options">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={sendNotifications}
                                        onChange={(event) => onSendNotificationsChange(event.target.checked)}
                                    />
                                    <HiOutlineBell aria-hidden="true" />
                                    {t('grades:entry.table.sendEmails')}
                                </label>
                                {sendNotifications && (
                                    <div className="grade-email-language">
                                        {emailLanguageControl}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="card-footer-actions grade-entry-actions">
                            {onPreviewEmail && (
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={onPreviewEmail}
                                    disabled={readyCount === 0}
                                >
                                    <HiOutlineEye size={18} aria-hidden="true" />
                                    {t('grades:entry.lesson.previewEmail')}
                                </button>
                            )}
                            {editMode && (
                                <button type="button" className="btn btn-secondary" onClick={onCancelEdit} disabled={submitting}>
                                    <HiOutlineX size={18} aria-hidden="true" />
                                    {t('grades:entry.table.cancelEdit')}
                                </button>
                            )}
                            <button
                                type="submit"
                                className="btn btn-primary grade-save-button"
                                disabled={submitting || !canSave}
                                title={!canSave ? saveHint : undefined}
                            >
                                {submitting ? (
                                    <>
                                        <span className="spinner" style={{ width: 18, height: 18 }}></span>
                                        {t('grades:common.saving')}
                                    </>
                                ) : (
                                    <>
                                        <HiOutlineSave size={18} aria-hidden="true" />
                                        {editMode
                                            ? t('grades:entry.table.updateGrades')
                                            : readyCount > 0
                                                ? t('grades:entry.table.saveCount', { count: readyCount })
                                                : t('grades:entry.table.save')}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </footer>
            </div>
        </form>
    );
};

export default GradeEntryTable;
