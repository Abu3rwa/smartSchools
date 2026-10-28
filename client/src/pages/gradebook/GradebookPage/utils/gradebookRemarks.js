import { splitRemarksBySentiment } from '../../../../utils/remarkSentiment.js';

const formatDate = (value, locale) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale || undefined, { dateStyle: 'medium' }).format(date);
};

/**
 * The clipboard text for one category: a header line, then one line per assessment
 * that carries at least one negative remark. Positive remarks and free-text notes
 * are left out on purpose — this list is for following up on problems.
 */
export const buildNegativeRemarksText = ({
    students = [],
    gradesByStudent = new Map(),
    category,
    title = '',
    locale
}) => {
    const lines = [];

    students.forEach((student) => {
        const grades = gradesByStudent instanceof Map
            ? (gradesByStudent.get(student._id) || [])
            : (gradesByStudent[student._id] || []);
        grades.forEach((grade) => {
            if (grade.category !== category) return;
            const { negatives } = splitRemarksBySentiment(grade.remarks);
            if (!negatives.length) return;
            const context = [grade.title, formatDate(grade.date, locale)].filter(Boolean).join(' · ');
            const name = `${student.firstName || ''} ${student.lastName || ''}`.trim();
            lines.push(`${name}${context ? ` (${context})` : ''}: ${negatives.join('; ')}`);
        });
    });

    if (!lines.length) return '';
    return title ? [title, ...lines].join('\n') : lines.join('\n');
};
