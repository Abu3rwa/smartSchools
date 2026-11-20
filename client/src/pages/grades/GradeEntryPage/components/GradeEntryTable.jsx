import {
    HiOutlineBell,
    HiOutlineCheckCircle,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlineSave,
    HiOutlineX
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const GradeEntryTable = ({
    classStudents,
    grades,
    maxMarks,
    sendNotifications,
    onSendNotificationsChange,
    emailLanguageControl,
    onGradeChange,
    enteredCount,
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

    return (
        <form onSubmit={onSubmit}>
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        {editMode
                            ? t('grades:entry.table.editTitle', { defaultValue: 'Edit Grades ({{count}} students)', count: classStudents.length })
                            : t('grades:entry.table.title', { count: classStudents.length })}
                    </h3>
                    <div className="header-actions">
                        {editMode && (
                            <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
                                <HiOutlinePencil size={14} />
                                {t('grades:entry.table.editMode', { defaultValue: 'Edit Mode' })}
                            </span>
                        )}
                        {!editMode && (
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={sendNotifications}
                                    onChange={(event) => onSendNotificationsChange(event.target.checked)}
                                />
                                <HiOutlineBell />
                                {t('grades:entry.table.sendEmails', { defaultValue: 'Email parents and students when saving' })}
                            </label>
                        )}
                    </div>
                </div>

                {!editMode && sendNotifications && (
                    <div style={{ padding: '0 16px 12px' }}>
                        {emailLanguageControl}
                    </div>
                )}

                <div className="table-container">
                    <table className="grade-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{t('grades:entry.table.columns.student')}</th>
                                <th>ID</th>
                                <th>{t('grades:entry.table.columns.marks', { maxMarks })}</th>
                                <th>{t('grades:entry.table.columns.remarks')}</th>
                                {showBehaviorAction && <th>Behavior</th>}
                                <th>{t('grades:entry.table.columns.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {classStudents.map((student, index) => {
                                const markValue = grades[student._id]?.marks;
                                const numericMark = Number(markValue);
                                const hasMark = markValue !== '' && markValue !== undefined;
                                const previewValid = hasMark && markValue !== null
                                    && Number.isFinite(numericMark) && numericMark >= 0 && numericMark <= maxMarks;

                                return (
                                    <tr key={student._id}>
                                        <td className="row-number">{index + 1}</td>
                                        <td>
                                            <div className="student-cell">
                                                <div className="avatar-sm">
                                                    {student.firstName?.charAt(0)}
                                                    {student.lastName?.charAt(0)}
                                                </div>
                                                <span>{student.firstName} {student.lastName}</span>
                                            </div>
                                        </td>
                                        <td className="text-muted font-mono">{student.studentId}</td>
                                        <td>
                                            <input
                                                type="number"
                                                className="marks-input"
                                                value={grades[student._id]?.marks ?? ''}
                                                onChange={(event) => onGradeChange(student._id, 'marks', event.target.value)}
                                                min={0}
                                                max={maxMarks}
                                                step={0.01}
                                                placeholder="-"
                                            />
                                        </td>
                                        {showBehaviorAction && (
                                            <td>
                                                <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenBehavior(student)}>
                                                    Score behavior
                                                </button>
                                            </td>
                                        )}
                                        <td>
                                            <input
                                                type="text"
                                                className="remarks-input"
                                                value={grades[student._id]?.remarks || ''}
                                                onChange={(event) => onGradeChange(student._id, 'remarks', event.target.value)}
                                                placeholder={t('grades:entry.table.optional')}
                                            />
                                        </td>
                                        <td>
                                            <div className="status-cell">
                                                {hasMark && <HiOutlineCheckCircle className="status-icon success" size={20} />}
                                                {onPreviewStudent && (
                                                    <button
                                                        type="button"
                                                        className="row-preview-icon"
                                                        onClick={() => onPreviewStudent(student)}
                                                        disabled={!previewValid}
                                                        aria-label={t('grades:entry.preview.rowLabel', { name: `${student.firstName} ${student.lastName}` })}
                                                        title={previewValid
                                                            ? t('grades:entry.lesson.previewEmail', { defaultValue: 'Preview email' })
                                                            : t('grades:entry.preview.needsMark', { defaultValue: 'Enter a valid mark to preview this email' })}
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

                <div className="card-footer">
                    <div className="entry-summary">
                        <span>{t('grades:entry.table.summary', { entered: enteredCount, total: classStudents.length })}</span>
                    </div>
                    <div className="card-footer-actions">
                        {onPreviewEmail && (
                            <button
                                type="button"
                                className="btn btn-outline btn-lg"
                                onClick={onPreviewEmail}
                                disabled={enteredCount === 0}
                            >
                                <HiOutlineEye size={20} />
                                {t('grades:entry.lesson.previewEmail', { defaultValue: 'Preview email' })}
                            </button>
                        )}
                        {editMode && (
                            <button type="button" className="btn btn-secondary btn-lg" onClick={onCancelEdit} disabled={submitting}>
                                <HiOutlineX size={20} />
                                {t('grades:entry.table.cancelEdit', { defaultValue: 'Cancel' })}
                            </button>
                        )}
                        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                            {submitting ? (
                                <>
                                    <span className="spinner" style={{ width: 20, height: 20 }}></span>
                                    {t('grades:common.saving')}
                                </>
                            ) : (
                                <>
                                    <HiOutlineSave size={20} />
                                    {editMode
                                        ? t('grades:entry.table.updateGrades', { defaultValue: 'Update Grades' })
                                        : t('grades:entry.table.save')}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
};

export default GradeEntryTable;
