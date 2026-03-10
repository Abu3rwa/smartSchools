import {
    HiOutlineBell,
    HiOutlineCheckCircle,
    HiOutlineSave
} from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const GradeEntryTable = ({
    classStudents,
    grades,
    maxMarks,
    sendNotifications,
    onSendNotificationsChange,
    onGradeChange,
    enteredCount,
    submitting,
    onSubmit
}) => {
    const { t } = useTranslation(['grades']);

    return (
        <form onSubmit={onSubmit}>
            <div className="card">
                <div className="card-header">
                    <h3 className="card-title">
                        {t('grades:entry.table.title', { count: classStudents.length })}
                    </h3>
                    <div className="header-actions">
                        <label className="checkbox-label">
                            <input
                                type="checkbox"
                                checked={sendNotifications}
                                onChange={(event) => onSendNotificationsChange(event.target.checked)}
                            />
                            <HiOutlineBell />
                            {t('grades:entry.table.sendParentNotifications')}
                        </label>
                    </div>
                </div>

                <div className="table-container">
                    <table className="grade-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{t('grades:entry.table.columns.student')}</th>
                                <th>ID</th>
                                <th>{t('grades:entry.table.columns.marks', { maxMarks })}</th>
                                <th>{t('grades:entry.table.columns.remarks')}</th>
                                <th>{t('grades:entry.table.columns.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {classStudents.map((student, index) => (
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
                                            value={grades[student._id]?.marks || ''}
                                            onChange={(event) => onGradeChange(student._id, 'marks', event.target.value)}
                                            min={0}
                                            max={maxMarks}
                                            step={0.5}
                                            placeholder="-"
                                        />
                                    </td>
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
                                        {grades[student._id]?.marks && (
                                            <HiOutlineCheckCircle className="status-icon success" size={20} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="card-footer">
                    <div className="entry-summary">
                        <span>{t('grades:entry.table.summary', { entered: enteredCount, total: classStudents.length })}</span>
                    </div>
                    <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
                        {submitting ? (
                            <>
                                <span className="spinner" style={{ width: 20, height: 20 }}></span>
                                {t('grades:common.saving')}
                            </>
                        ) : (
                            <>
                                <HiOutlineSave size={20} />
                                {t('grades:entry.table.save')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default GradeEntryTable;
