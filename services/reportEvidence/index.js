import * as gradesCollector from './grades.js';
import * as spellingCollector from './spelling.js';
import * as liveLessonsCollector from './liveLessons.js';
import * as standardsCollector from './standards.js';
import * as attendanceCollector from './attendance.js';
import * as homeworkCollector from './homework.js';
import * as behaviorCollector from './behavior.js';

const COLLECTORS = {
    grades: gradesCollector,
    spelling: spellingCollector,
    liveLessons: liveLessonsCollector,
    standards: standardsCollector,
    attendance: attendanceCollector,
    homework: homeworkCollector,
    behavior: behaviorCollector
};

const ALL_SOURCES = Object.keys(COLLECTORS);

// Sources that describe the whole child: they carry no subject dimension, so a
// subject-filtered report still shows them unscoped and the prompt has to say so.
const WHOLE_CHILD_SOURCES = ['attendance', 'behavior', 'spelling', 'liveLessons'];

/**
 * Build the evidence pack for a student report.
 *
 * @param {object} params
 * @param {string} params.schoolId
 * @param {string} params.studentId
 * @param {string|Date} params.startDate
 * @param {string|Date} params.endDate
 * @param {string} [params.classId]
 * @param {string[]} [params.sources] — subset of ALL_SOURCES to run; defaults to all
 * @returns {Promise<{
 *   results: Record<string, object>,
 *   availableSources: string[],
 *   noDataSources: string[],
 *   failedSources: string[],
 *   totalRecordCount: number,
 *   allFacts: string[],
 *   promptContext: string
 * }>}
 */
export async function buildEvidencePack({
    schoolId,
    studentId,
    startDate,
    endDate,
    classId,
    subjectId,
    sources
}) {
    const sourcesToRun = (sources && sources.length > 0 ? sources : ALL_SOURCES)
        .filter(s => COLLECTORS[s]);

    const results = {};
    const settled = await Promise.allSettled(
        sourcesToRun.map(async (source) => {
            const collector = COLLECTORS[source];
            const result = await collector.collect({
                schoolId,
                studentId,
                startDate,
                endDate,
                classId,
                subjectId
            });
            return { source, result };
        })
    );

    for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value) {
            const { source, result } = outcome.value;
            results[source] = {
                ...result,
                // A collector that ran but found nothing is a different fact from
                // one that could not run; the teacher needs to tell them apart.
                status: result.available ? 'ok' : 'no_data'
            };
        } else if (outcome.status === 'rejected') {
            const failedSource = sourcesToRun[settled.indexOf(outcome)];
            results[failedSource] = {
                source: failedSource,
                available: false,
                status: 'failed',
                recordCount: 0,
                metrics: {},
                facts: [],
                trend: 'insufficient_data',
                error: outcome.reason?.message || 'Unknown error'
            };
        }
    }

    const availableSources = Object.entries(results)
        .filter(([, r]) => r.status === 'ok')
        .map(([name]) => name);

    const noDataSources = Object.entries(results)
        .filter(([, r]) => r.status === 'no_data')
        .map(([name]) => name);

    const failedSources = Object.entries(results)
        .filter(([, r]) => r.status === 'failed')
        .map(([name]) => name);

    const totalRecordCount = Object.values(results)
        .reduce((sum, r) => sum + (r.recordCount || 0), 0);

    const allFacts = [];
    for (const source of sourcesToRun) {
        const result = results[source];
        if (!result || !result.available) continue;
        const label = sourceLabel(source);
        allFacts.push(`--- ${label} ---`);
        for (const fact of result.facts) {
            allFacts.push(fact);
        }
    }

    const promptContext = buildPromptContext(results, availableSources, {
        subjectScoped: Boolean(subjectId),
        wholeChildSources: WHOLE_CHILD_SOURCES.filter(s => sourcesToRun.includes(s))
    });

    return {
        results,
        availableSources,
        noDataSources,
        failedSources,
        totalRecordCount,
        allFacts,
        promptContext
    };
}

function sourceLabel(source) {
    const labels = {
        grades: 'Academic Grades',
        spelling: 'Spelling Practice',
        liveLessons: 'Live Lesson Participation',
        standards: 'Standards Mastery',
        attendance: 'Attendance',
        homework: 'Homework Completion',
        behavior: 'Behavior'
    };
    return labels[source] || source;
}

function buildPromptContext(results, availableSources, { subjectScoped = false, wholeChildSources = [] } = {}) {
    if (availableSources.length === 0) return '';

    const lines = [];
    lines.push('EVIDENCE PACK — verified data from the school system:');
    if (subjectScoped && wholeChildSources.length > 0) {
        lines.push(
            `This report is scoped to one subject. ${wholeChildSources.map(sourceLabel).join(', ')} ` +
            'cover the whole child and are NOT limited to that subject — never present them as subject results.'
        );
    }
    lines.push('');

    for (const source of availableSources) {
        const r = results[source];
        if (!r) continue;
        lines.push(`[${sourceLabel(source)}]`);
        lines.push(`Records: ${r.recordCount} | Trend: ${r.trend}`);
        if (r.metrics && Object.keys(r.metrics).length > 0) {
            const metricLines = formatMetrics(r.metrics);
            if (metricLines) lines.push(metricLines);
        }
        for (const fact of r.facts) {
            lines.push(`- ${fact}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function formatMetrics(metrics) {
    const skip = new Set(['bySubject', 'byType', 'byStandard', 'byStatus']);
    const parts = [];
    for (const [key, value] of Object.entries(metrics)) {
        if (skip.has(key)) continue;
        if (typeof value === 'number') {
            parts.push(`${key}: ${value}`);
        } else if (typeof value === 'boolean') {
            parts.push(`${key}: ${value ? 'yes' : 'no'}`);
        }
    }
    return parts.length > 0 ? parts.join(' | ') : '';
}

export { ALL_SOURCES, COLLECTORS };
