import BehaviorCounter from '../../models/BehaviorCounter.js';
import BehaviorCountReset from '../../models/BehaviorCountReset.js';
import BehaviorIncident from '../../models/BehaviorIncident.js';
import { NON_COUNTED_STATUSES } from '../../constants/behavior.js';
import { resolveCountingWindow, suggestStep } from './suggestionService.js';

const DUPLICATE_KEY = 11000;

/** Newest reset marker that applies to this student + behavior pair. */
export const findApplicableReset = async ({ schoolId, studentId, behaviorTypeId }) => BehaviorCountReset
    .findOne({
        school: schoolId,
        student: studentId,
        $or: [{ behaviorType: null }, { behaviorType: behaviorTypeId }]
    })
    .sort({ resetAt: -1 })
    .select('resetAt behaviorType')
    .lean();

export const buildCountingWindow = async ({
    schoolId, studentId, behaviorTypeId, settings, yearBounds, lastResetAt = undefined
}) => {
    let resetAt = lastResetAt;
    if (resetAt === undefined) {
        const reset = await findApplicableReset({ schoolId, studentId, behaviorTypeId });
        resetAt = reset?.resetAt || null;
    }

    return resolveCountingWindow({
        mode: settings?.counting?.mode,
        rollingDays: settings?.counting?.rollingDays,
        academicYear: settings?.counting?.academicYear || yearBounds?.academicYear || null,
        semester: yearBounds?.semester ?? null,
        yearStart: yearBounds?.start ?? null,
        yearEnd: yearBounds?.end ?? null,
        lastResetAt: resetAt
    });
};

/**
 * Re-counts from incidents. Only used to seed a brand-new counter bucket, so the
 * steady-state escalation path never scans the incidents collection.
 */
export const countIncidentsInWindow = async ({ schoolId, studentId, behaviorTypeId, window }) => {
    const occurredAt = {};
    if (window.start) occurredAt.$gte = window.start;
    if (window.end) occurredAt.$lte = window.end;

    return BehaviorIncident.countDocuments({
        school: schoolId,
        student: studentId,
        behaviorType: behaviorTypeId,
        status: { $nin: NON_COUNTED_STATUSES },
        ...(Object.keys(occurredAt).length ? { occurredAt } : {})
    });
};

const readCounter = ({ schoolId, studentId, behaviorTypeId, window }) => BehaviorCounter
    .findOne({
        school: schoolId,
        student: studentId,
        behaviorType: behaviorTypeId,
        windowKey: window.key
    })
    .select('count')
    .lean();

/**
 * Read-only suggestion for the logging screen. Never increments anything: the
 * number is only reserved when the staff member actually confirms.
 */
export const previewOccurrence = async ({
    schoolId, studentId, behaviorTypeId, ladder, settings, window
}) => {
    const existing = await readCounter({ schoolId, studentId, behaviorTypeId, window });
    const priorCount = existing
        ? existing.count
        : await countIncidentsInWindow({ schoolId, studentId, behaviorTypeId, window });

    const suggestion = suggestStep({ priorCount, ladder, settings });
    return {
        ...suggestion,
        window,
        priorCount,
        countSnapshot: {
            priorCount,
            occurrence: suggestion.occurrence,
            mode: window.mode,
            windowKey: window.key,
            windowStart: window.start,
            windowEnd: window.end,
            ladderLength: suggestion.ladderLength,
            overflow: suggestion.overflow
        }
    };
};

/**
 * Atomically takes the next occurrence number for this student + behavior
 * inside the window. Two staff logging the same pair at the same instant get
 * different numbers, which is what keeps the ladder from repeating a step.
 */
export const reserveOccurrence = async ({
    schoolId, studentId, behaviorTypeId, window
}) => {
    const filter = {
        school: schoolId,
        student: studentId,
        behaviorType: behaviorTypeId,
        windowKey: window.key
    };

    const existing = await readCounter({ schoolId, studentId, behaviorTypeId, window });
    if (!existing) {
        // First incident for this bucket: adopt whatever the history already
        // holds so escalation continues from the true number.
        const baseline = await countIncidentsInWindow({ schoolId, studentId, behaviorTypeId, window });
        try {
            await BehaviorCounter.findOneAndUpdate(
                filter,
                {
                    $set: { windowStart: window.start, windowEnd: window.end, mode: window.mode },
                    $setOnInsert: { ...filter, count: baseline }
                },
                { upsert: true, new: false }
            );
        } catch (error) {
            if (error?.code !== DUPLICATE_KEY) throw error;
        }
    }

    const counter = await BehaviorCounter.findOneAndUpdate(
        filter,
        { $inc: { count: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return {
        occurrence: counter.count,
        priorCount: Math.max(counter.count - 1, 0),
        windowKey: counter.windowKey
    };
};

export const getCounterValue = async ({ schoolId, studentId, behaviorTypeId, window }) => {
    const existing = await readCounter({ schoolId, studentId, behaviorTypeId, window });
    if (existing) return existing.count;
    return countIncidentsInWindow({ schoolId, studentId, behaviorTypeId, window });
};
