import MasteryRecord from '../../models/MasteryRecord.js';
import StandardsGradebookEntry from '../../models/StandardsGradebookEntry.js';
import Standard from '../../models/Standard.js';
import { startOfDay, endOfDay } from './dateRange.js';

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

    const rangeStart = startOfDay(startDate);
    const rangeEnd = endOfDay(endDate);

    const dateFilteredEntries = entries.filter(e => {
        const d = e.submittedAt || e.releasedAt || e.createdAt;
        if (!d) return true;
        const date = new Date(d);
        if (rangeStart && date < rangeStart) return false;
        if (rangeEnd && date > rangeEnd) return false;
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
            : null;
    }

    const withPercentage = dateFilteredEntries.filter(e => e.percentage != null);
    // No scored entries means no average — 0% would misread as "failed everything".
    const overallPct = withPercentage.length > 0
        ? Math.round(withPercentage.reduce((s, e) => s + e.percentage, 0) / withPercentage.length)
        : null;

    // Entries come back in insertion order, which is not necessarily chronological.
    const entryDate = (e) => new Date(e.submittedAt || e.releasedAt || e.createdAt || 0).getTime();
    const chronological = [...dateFilteredEntries].sort((a, b) => entryDate(a) - entryDate(b));
    const half = Math.floor(chronological.length / 2);
    const olderPct = chronological.slice(0, half).filter(e => e.percentage != null);
    const newerPct = chronological.slice(half).filter(e => e.percentage != null);

    const olderAvg = olderPct.length > 0
        ? olderPct.reduce((s, e) => s + e.percentage, 0) / olderPct.length
        : null;
    const newerAvg = newerPct.length > 0
        ? newerPct.reduce((s, e) => s + e.percentage, 0) / newerPct.length
        : null;

    let trend = 'insufficient_data';
    if (chronological.length >= 4 && olderAvg !== null && newerAvg !== null) {
        const diff = newerAvg - olderAvg;
        if (diff > 5) trend = 'improving';
        else if (diff < -5) trend = 'declining';
        else trend = 'stable';
    }

    const facts = [];
    if (totalStandards > 0) {
        // Mastery records are cumulative current state, not period activity.
        facts.push(`Current mastery (cumulative): ${totalStandards} standards tracked. Mastered: ${masteredCount}. Needs review: ${needsReviewCount}.`);
    }
    if (dateFilteredEntries.length > 0) {
        const avgText = overallPct !== null ? ` Overall average: ${overallPct}%.` : '';
        facts.push(`Practice entries in period: ${dateFilteredEntries.length}.${avgText}`);
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
