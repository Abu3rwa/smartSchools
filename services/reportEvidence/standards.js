import MasteryRecord from '../../models/MasteryRecord.js';
import StandardsGradebookEntry from '../../models/StandardsGradebookEntry.js';
import Standard from '../../models/Standard.js';

/**
 * Evidence collector for standards mastery.
 * Queries MasteryRecord and StandardsGradebookEntry.
 */
export async function collect({ schoolId, studentId, startDate, endDate, subjectId }) {
    let standardIdsInSubject = null;
    if (subjectId) {
        const subjectStandards = await Standard.find({
            school: schoolId,
            subject: subjectId
        }).select('_id').lean();
        standardIdsInSubject = new Set(subjectStandards.map(s => String(s._id)));
    }

    const [allMasteryRecords, allEntries] = await Promise.all([
        MasteryRecord.find({
            school: schoolId,
            student: studentId
        }).lean(),
        StandardsGradebookEntry.find({
            school: schoolId,
            student: studentId
        }).lean()
    ]);

    const inSubject = (row) => !standardIdsInSubject || standardIdsInSubject.has(String(row.standard));

    const masteryRecords = allMasteryRecords.filter(inSubject);
    const entries = allEntries.filter(inSubject);

    const dateFilteredEntries = entries.filter(e => {
        const d = e.submittedAt || e.releasedAt || e.createdAt;
        if (!d) return true;
        const date = new Date(d);
        if (startDate && date < new Date(startDate)) return false;
        if (endDate && date > new Date(`${endDate}T23:59:59.999Z`)) return false;
        return true;
    });

    if (masteryRecords.length === 0 && dateFilteredEntries.length === 0) {
        return {
            source: 'standards',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const masteredCount = masteryRecords.filter(m => m.isMastered).length;
    const needsReviewCount = masteryRecords.filter(m => m.needsReview).length;
    const totalStandards = masteryRecords.length;

    const standardIds = [...new Set([
        ...masteryRecords.map(m => String(m.standard)),
        ...dateFilteredEntries.map(e => String(e.standard))
    ])];

    const standards = standardIds.length > 0
        ? await Standard.find({ _id: { $in: standardIds } })
            .select('code name subject gradeLevel')
            .populate('subject', 'name')
            .lean()
        : [];

    const standardMap = new Map(standards.map(s => [String(s._id), s]));

    const byStandard = {};
    for (const entry of dateFilteredEntries) {
        const stdId = String(entry.standard);
        const std = standardMap.get(stdId);
        const key = std?.code || stdId;
        if (!byStandard[key]) {
            byStandard[key] = {
                code: std?.code || key,
                name: std?.name || 'Unknown',
                subject: std?.subject,
                entries: [],
                averagePct: 0
            };
        }
        byStandard[key].entries.push(entry);
    }

    for (const data of Object.values(byStandard)) {
        const withPct = data.entries.filter(e => e.percentage != null);
        data.averagePct = withPct.length > 0
            ? Math.round(withPct.reduce((s, e) => s + e.percentage, 0) / withPct.length)
            : 0;
    }

    const overallPct = dateFilteredEntries.length > 0
        ? Math.round(
            dateFilteredEntries
                .filter(e => e.percentage != null)
                .reduce((s, e) => s + e.percentage, 0)
            / Math.max(1, dateFilteredEntries.filter(e => e.percentage != null).length)
        )
        : 0;

    const half = Math.floor(dateFilteredEntries.length / 2);
    const firstEntries = dateFilteredEntries.slice(half);
    const secondEntries = dateFilteredEntries.slice(0, half);

    const firstPct = firstEntries.filter(e => e.percentage != null);
    const secondPct = secondEntries.filter(e => e.percentage != null);

    const firstAvg = firstPct.length > 0
        ? Math.round(firstPct.reduce((s, e) => s + e.percentage, 0) / firstPct.length)
        : 0;
    const secondAvg = secondPct.length > 0
        ? Math.round(secondPct.reduce((s, e) => s + e.percentage, 0) / secondPct.length)
        : 0;

    let trend = 'stable';
    if (dateFilteredEntries.length >= 4) {
        const diff = secondAvg - firstAvg;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
    }

    const facts = [];
    if (totalStandards > 0) {
        facts.push(`Standards tracked: ${totalStandards}. Mastered: ${masteredCount}. Needs review: ${needsReviewCount}.`);
    }
    if (dateFilteredEntries.length > 0) {
        facts.push(`Practice entries in period: ${dateFilteredEntries.length}. Overall average: ${overallPct}%.`);
    }
    const subjectSet = new Set(
        Object.values(byStandard)
            .map(s => s.subject?.name || s.subject)
            .filter(Boolean)
            .map(String)
    );
    if (subjectSet.size > 0) {
        facts.push(`Subjects covered: ${[...subjectSet].join(', ')}.`);
    }

    return {
        source: 'standards',
        available: true,
        recordCount: dateFilteredEntries.length + masteryRecords.length,
        metrics: {
            totalStandards,
            masteredCount,
            needsReviewCount,
            practiceEntries: dateFilteredEntries.length,
            overallPct,
            byStandard
        },
        facts,
        trend
    };
}
