import { behaviorEvidenceRows } from '../behavior/eventQueryService.js';
import { endOfDay } from './dateRange.js';

const serious = (row) => row.formalCase?.isSerious || ['high', 'critical'].includes(row.severity);
const countedCase = (row) => row.formalCase && !['voided', 'merged'].includes(row.formalCase.status);
export async function collect({ schoolId, studentId, startDate, endDate }) {
    const incidents = await behaviorEvidenceRows({ schoolId, studentId, startDate, endDate: endDate ? endOfDay(endDate) : null });

    if (incidents.length === 0) {
        return {
            source: 'behavior',
            available: false,
            recordCount: 0,
            metrics: {},
            facts: [],
            trend: 'insufficient_data'
        };
    }

    const byStatus = {};
    const byType = {};
    let seriousCount = 0;

    for (const incident of incidents) {
        const status = countedCase(incident) ? incident.formalCase.status : (incident.followUpCompletedAt ? 'closed' : incident.status || 'open');
        byStatus[status] = (byStatus[status] || 0) + 1;

        const typeName = incident.typeName || incident.category || 'formal_case';
        byType[typeName] = (byType[typeName] || 0) + 1;

        if (serious(incident)) seriousCount += 1;
    }

    const resolvedCount = (byStatus['closed'] || 0) + (byStatus['approved'] || 0);
    const pendingCount = (byStatus['logged'] || 0) + (byStatus['pending_approval'] || 0);
    const inProgressCount = byStatus['in_progress'] || 0;

    const half = Math.floor(incidents.length / 2);
    const olderIncidents = incidents.slice(half);
    const newerIncidents = incidents.slice(0, half);

    const olderSerious = olderIncidents.filter(serious).length;
    const newerSerious = newerIncidents.filter(serious).length;

    let trend = 'insufficient_data';
    if (incidents.length >= 4) {
        if (newerSerious < olderSerious) trend = 'improving';
        else if (newerSerious > olderSerious) trend = 'declining';
        else trend = 'stable';
    }

    const facts = [];
    const formalCount = incidents.filter(countedCase).length;
    facts.push(`Behavior records: ${incidents.length} total, including ${formalCount} formal cases. Routine observations do not count toward consequences.`);
    facts.push(`Serious incidents: ${seriousCount}.`);
    facts.push(`Resolved: ${resolvedCount}. Pending: ${pendingCount}. In progress: ${inProgressCount}.`);

    const typeEntries = Object.entries(byType);
    if (typeEntries.length > 0) {
        const topTypes = typeEntries
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([name, count]) => `${name} (${count})`)
            .join(', ');
        facts.push(`Top behavior types: ${topTypes}.`);
    }

    return {
        source: 'behavior',
        available: true,
        recordCount: incidents.length,
        metrics: {
            totalRecords: incidents.length,
            totalIncidents: formalCount,
            routineRecords: incidents.length - formalCount,
            seriousCount,
            resolvedCount,
            pendingCount,
            inProgressCount,
            byStatus,
            byType
        },
        facts,
        trend
    };
}
