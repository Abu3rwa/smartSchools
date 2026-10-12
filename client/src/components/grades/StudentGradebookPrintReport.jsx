import { useTranslation } from 'react-i18next';
import './StudentGradebookPrintReport.css';

const RULE_REMARK_PREFIX = /^Followed (?:the|classroom) rules:\s*/i;

const splitRemarksBySentiment = (text) => {
    const positives = [];
    const negatives = [];
    const others = [];

    String(text || '').split(';').map((part) => part.trim()).filter(Boolean).forEach((part) => {
        const remark = part.replace(RULE_REMARK_PREFIX, '').trim();
        const scoreMatch = remark.match(/^(.*?)\s*\(([+-])\s*(\d+(?:\.\d+)?)\)\s*$/);
        if (!scoreMatch) {
            others.push(remark);
        } else if (scoreMatch[2] === '+') {
            positives.push(`${scoreMatch[1].trim()} (+${scoreMatch[3]})`);
        } else {
            negatives.push(`${scoreMatch[1].trim()} (-${scoreMatch[3]})`);
        }
    });

    return { positives, negatives, others };
};

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
                <colgroup>
                    <col className="sgp-date-column" />
                    <col className="sgp-subject-column" />
                    <col className="sgp-type-column" />
                    <col className="sgp-score-column" />
                    <col className="sgp-percentage-column" />
                    <col className="sgp-remarks-column" />
                </colgroup>
                <thead>
                    <tr>
                        <th>{t('studentGrades:table.columns.date')}</th>
                        <th>{t('studentGrades:table.columns.subject')}</th>
                        <th>{t('studentGrades:table.columns.type')}</th>
                        <th>{t('studentGrades:table.columns.marks')} / {t('studentGrades:table.columns.max')}</th>
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
                            <td>{grade.marks} / {grade.maxMarks}</td>
                            <td>{grade.maxMarks > 0 ? `${Math.round((grade.marks / grade.maxMarks) * 10000) / 100}%` : t('studentGrades:common.dash')}</td>
                            <td className="sgp-remarks">
                                {(() => {
                                    const { positives, negatives, others } = splitRemarksBySentiment(grade.remarks);
                                    if (!positives.length && !negatives.length) {
                                        return others.join('; ') || t('studentGrades:common.dash');
                                    }
                                    return (
                                        <>
                                            <div className="sgp-remarks-row sgp-remarks-positive">
                                                <strong>{t('studentGrades:export.positive')}:</strong> {positives.join('; ') || t('studentGrades:common.dash')}
                                            </div>
                                            <div className="sgp-remarks-row sgp-remarks-negative">
                                                <strong>{t('studentGrades:export.negative')}:</strong> {negatives.join('; ') || t('studentGrades:common.dash')}
                                            </div>
                                            {others.length > 0 && <div className="sgp-remarks-other">{others.join('; ')}</div>}
                                        </>
                                    );
                                })()}
                            </td>
                        </tr>
                    ))}
                    {report.grades.length === 0 && (
                        <tr><td colSpan="6">{t('studentGrades:states.empty')}</td></tr>
                    )}
                </tbody>
            </table>
        </article>
    );
};

export default StudentGradebookPrintReport;
