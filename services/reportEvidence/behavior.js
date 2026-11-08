import BehaviorIncident from '../../models/BehaviorIncident.js';
import { endOfDay } from './dateRange.js';

/**
 * Evidence collector for behavior.
 * Queries BehaviorIncident with date range filtering.
 */
export async function collect({ schoolId, studentId, startDate, endDate }) {
    const query = {
        school: schoolId,
        student: studentId,
        status: { $nin: ['voided', 'merged'] }
    };

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = endOfDay(endDate);
    if (Object.keys(dateFilter).length > 0) query.occurredAt = dateFilter;

    const incidents = await BehaviorIncident.find(query)
        .populate('behaviorType', 'name level')
        .sort({ occurredAt: -1 })
        .lean();

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
        const status = incident.status || 'unknown';
        byStatus[status] = (byStatus[status] || 0) + 1;

        const typeName = incident.behaviorType?.name || 'Unknown';
        byType[typeName] = (byType[typeName] || 0) + 1;

        if (incident.isSerious) seriousCount += 1;
    }

    const resolvedCount = (byStatus['closed'] || 0) + (byStatus['approved'] || 0);
    const pendingCount = (byStatus['logged'] || 0) + (byStatus['pending_approval'] || 0);
    const inProgressCount = byStatus['in_progress'] || 0;

    const half = Math.floor(incidents.length / 2);
    const olderIncidents = incidents.slice(half);
    const newerIncidents = incidents.slice(0, half);

    const olderSerious = olderIncidents.filter(i => i.isSerious).length;
    const newerSerious = newerIncidents.filter(i => i.isSerious).length;

    let trend = 'insufficient_data';
    if (incidents.length >= 4) {
        if (newerSerious < olderSerious) trend = 'improving';
        else if (newerSerious > olderSerious) trend = 'declining';
        else trend = 'stable';
    }

    const facts = [];
    facts.push(`Behavior incidents: ${incidents.length} total.`);
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
            totalIncidents: incidents.length,
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
