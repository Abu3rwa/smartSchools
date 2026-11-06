import gradeService from '../gradeService.js';

/**
 * Evidence collector for grades.
 * Wraps the existing gradeService.getStudentGradesByDateRange.
 */
export async function collect({ studentId, startDate, endDate, subjectId }) {
    let grades = await gradeService.getStudentGradesByDateRange(studentId, {
        startDate,
        endDate
    });

    if (subjectId) {
        grades = grades.filter(g => String(g.subject?._id || g.subject || '') === String(subjectId));
    }

    if (!grades || grades.length === 0) {
        return {
            source: 'grades',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const totalMarks = grades.reduce((sum, g) => sum + (g.marks || 0), 0);
    const totalMax = grades.reduce((sum, g) => sum + (g.maxMarks || 0), 0);
    const average = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : 0;

    const bySubject = {};
    for (const g of grades) {
        const name = g.subject?.name || 'Unknown';
        if (!bySubject[name]) bySubject[name] = { marks: 0, max: 0, count: 0 };
        bySubject[name].marks += g.marks || 0;
        bySubject[name].max += g.maxMarks || 0;
        bySubject[name].count += 1;
    }

    const subjectSummaries = Object.entries(bySubject).map(([name, data]) => ({
        subject: name,
        average: data.max > 0 ? Math.round((data.marks / data.max) * 100) : 0,
        count: data.count
    }));

    const byType = {};
    for (const g of grades) {
        const type = g.gradeType || 'other';
        if (!byType[type]) byType[type] = { marks: 0, max: 0, count: 0 };
        byType[type].marks += g.marks || 0;
        byType[type].max += g.maxMarks || 0;
        byType[type].count += 1;
    }

    const half = Math.floor(grades.length / 2);
    const firstHalf = grades.slice(half);
    const secondHalf = grades.slice(0, half);
    const firstAvg = firstHalf.length > 0
        ? firstHalf.reduce((s, g) => s + (g.maxMarks > 0 ? (g.marks / g.maxMarks) * 100 : 0), 0) / firstHalf.length
        : 0;
    const secondAvg = secondHalf.length > 0
        ? secondHalf.reduce((s, g) => s + (g.maxMarks > 0 ? (g.marks / g.maxMarks) * 100 : 0), 0) / secondHalf.length
        : 0;

    let trend = 'stable';
    if (grades.length >= 4) {
        const diff = secondAvg - firstAvg;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
    }

    const facts = [];
    facts.push(`Overall average: ${average}% across ${grades.length} grade entries.`);
    for (const s of subjectSummaries) {
        facts.push(`${s.subject}: ${s.average}% average (${s.count} entries).`);
    }
    for (const [type, data] of Object.entries(byType)) {
        const typeAvg = data.max > 0 ? Math.round((data.marks / data.max) * 100) : 0;
        facts.push(`${type}: ${typeAvg}% average (${data.count} entries).`);
    }

    return {
        source: 'grades',
        available: true,
        recordCount: grades.length,
        metrics: {
            average,
            totalMarks,
            totalMax,
            bySubject: subjectSummaries,
            byType
        },
        facts,
        trend
    };
}
