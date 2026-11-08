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
    // No measurable maximum means no average — a fabricated 0% would read as
    // "the student scored nothing" instead of "nothing was graded".
    const average = totalMax > 0 ? Math.round((totalMarks / totalMax) * 100) : null;

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
        average: data.max > 0 ? Math.round((data.marks / data.max) * 100) : null,
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

    // gradeService returns newest-first, so the second slice is the older half.
    const half = Math.floor(grades.length / 2);
    const olderHalf = grades.slice(half).filter(g => g.maxMarks > 0);
    const newerHalf = grades.slice(0, half).filter(g => g.maxMarks > 0);
    const olderAvg = olderHalf.length > 0
        ? olderHalf.reduce((s, g) => s + (g.marks / g.maxMarks) * 100, 0) / olderHalf.length
        : null;
    const newerAvg = newerHalf.length > 0
        ? newerHalf.reduce((s, g) => s + (g.marks / g.maxMarks) * 100, 0) / newerHalf.length
        : null;

    let trend = 'insufficient_data';
    if (grades.length >= 4 && olderAvg !== null && newerAvg !== null) {
        const diff = newerAvg - olderAvg;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
        else trend = 'stable';
    }

    const facts = [];
    if (average !== null) {
        facts.push(`Overall average: ${average}% across ${grades.length} grade entries.`);
    }
    for (const s of subjectSummaries) {
        if (s.average !== null) {
            facts.push(`${s.subject}: ${s.average}% average (${s.count} entries).`);
        }
    }
    for (const [type, data] of Object.entries(byType)) {
        if (data.max > 0) {
            const typeAvg = Math.round((data.marks / data.max) * 100);
            facts.push(`${type}: ${typeAvg}% average (${data.count} entries).`);
        }
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
