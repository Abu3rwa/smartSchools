import { useTranslation } from 'react-i18next';
import './StudentGradebookPrintReport.css';

const StudentGradebookPrintReport = ({ report }) => {
    const { t, i18n } = useTranslation(['studentGrades']);
    if (!report) return null;

    const locale = i18n.resolvedLanguage || i18n.language || 'en';
    const formatDate = (date) => date
        ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(date))
        : t('studentGrades:common.dash');

    return (
        <article className="student-gradebook-print" dir={locale.startsWith('ar') ? 'rtl' : 'ltr'}>
            <header>
                <h1>{t('studentGrades:export.title')}</h1>
                <p>{t('studentGrades:export.student')}: {report.studentName || t('studentGrades:common.dash')}</p>
                {report.studentNumber && <p>{t('studentGrades:export.studentId')}: {report.studentNumber}</p>}
                <p>{t('studentGrades:export.subject')}: {report.subjectName}</p>
                <p>{t('studentGrades:export.period')}: {report.periodLabel}</p>
            </header>
            <table>
                <thead>
                    <tr>
                        <th>{t('studentGrades:table.columns.date')}</th>
                        <th>{t('studentGrades:table.columns.subject')}</th>
                        <th>{t('studentGrades:table.columns.type')}</th>
                        <th>{t('studentGrades:table.columns.marks')}</th>
                        <th>{t('studentGrades:table.columns.max')}</th>
                        <th>{t('studentGrades:export.percentage')}</th>
                        <th>{t('studentGrades:table.columns.remarks')}</th>
                    </tr>
                </thead>
                <tbody>
                    {report.grades.map((grade) => (
                        <tr key={grade._id}>
                            <td>{formatDate(grade.date)}</td>
                            <td>{grade.subject?.name || t('studentGrades:common.dash')}</td>
                            <td>{t(`studentGrades:types.${grade.gradeType}`, { defaultValue: grade.gradeType || t('studentGrades:common.notAvailable') })}</td>
                            <td>{grade.marks}</td>
                            <td>{grade.maxMarks}</td>
                            <td>{grade.maxMarks > 0 ? `${Math.round((grade.marks / grade.maxMarks) * 10000) / 100}%` : t('studentGrades:common.dash')}</td>
                            <td>{grade.remarks || t('studentGrades:common.dash')}</td>
                        </tr>
                    ))}
                    {report.grades.length === 0 && (
                        <tr><td colSpan="7">{t('studentGrades:states.empty')}</td></tr>
                    )}
                </tbody>
            </table>
        </article>
    );
};

export default StudentGradebookPrintReport;
