import { HiOutlineCheckCircle } from 'react-icons/hi';
import { useTranslation } from 'react-i18next';

const AssignmentGradePanel = ({
    gradingAssignment,
    gradeStudents,
    gradeRows,
    onGradeChange,
    onClose,
    onSubmitGrades
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
                            <th>{t('assignments:gradePanel.columns.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {gradeStudents.map((student) => (
                            <tr key={student.id}>
                                <td>{student.fullName || `${student.firstName} ${student.lastName}`}</td>
                                <td>
                                    <input
                                        type="number"
                                        min={0}
                                        max={gradingAssignment.maxMarks}
                                        value={gradeRows[student.id]?.marks ?? ''}
                                        onChange={(event) => onGradeChange(student.id, 'marks', event.target.value)}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        value={gradeRows[student.id]?.remarks ?? ''}
                                        onChange={(event) => onGradeChange(student.id, 'remarks', event.target.value)}
                                        placeholder={t('assignments:gradePanel.optional')}
                                    />
                                </td>
                                <td>
                                    {gradeRows[student.id]?.marks !== '' && gradeRows[student.id]?.marks !== undefined && (
                                        <HiOutlineCheckCircle className="status-icon success" />
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="card-footer">
                <button type="button" className="btn btn-primary" onClick={onSubmitGrades}>
                    {t('assignments:gradePanel.save')}
                </button>
            </div>
        </div>
    );
};

export default AssignmentGradePanel;
