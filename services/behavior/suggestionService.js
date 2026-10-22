/**
 * Pure escalation logic for the Behavior & Consequence module.
 * Nothing here touches the database so the rules stay unit-testable.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const toTimestamp = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const orderedSteps = (ladder) => (ladder?.steps || [])
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0));

/**
 * A reset marker has to restart the window in every mode, not only in manual and
 * rolling ones. When the reset falls inside the window it becomes the new start
 * and joins the key, so the counter moves to a fresh bucket.
 */
const withResetAnchor = ({ mode, baseKey, start, end, reset }) => {
    const windowStart = toTimestamp(start);
    const anchored = reset && (windowStart === null || reset > windowStart) ? reset : null;

    return {
        mode,
        key: anchored ? `${baseKey}:reset-${new Date(anchored).toISOString()}` : baseKey,
        start: anchored ? new Date(anchored) : (windowStart ? new Date(windowStart) : null),
        end: end ?? null
    };
};

/**
 * The counting window decides which incidents are still "on record" for
 * escalation. Each mode produces a stable windowKey, which is what the atomic
 * counter is bucketed by, plus the start/end used when re-counting from
 * incidents.
 */
export const resolveCountingWindow = ({
    mode = 'school_year',
    rollingDays = 90,
    now = new Date(),
    academicYear = null,
    semester = null,
    yearStart = null,
    yearEnd = null,
    lastResetAt = null
} = {}) => {
    const current = toTimestamp(now) ?? Date.now();
    const nowDate = new Date(current);
    const start = toTimestamp(yearStart);
    const end = toTimestamp(yearEnd);
    const reset = toTimestamp(lastResetAt);

    if (mode === 'rolling_days') {
        const days = Math.min(Math.max(parseInt(rollingDays, 10) || 1, 1), 366);
        // Buckets are anchored at the last reset (or the year start) so a
        // window boundary is fixed instead of sliding under each request.
        const anchor = reset ?? start ?? current - days * DAY_MS;
        const elapsed = Math.max(current - anchor, 0);
        const index = Math.floor(elapsed / (days * DAY_MS));
        const bucketStart = anchor + index * days * DAY_MS;
        const bucketEnd = Math.min(bucketStart + days * DAY_MS, end || Number.POSITIVE_INFINITY);
        return {
            mode,
            key: `rolling:${days}:${new Date(anchor).toISOString()}:${index}`,
            start: new Date(bucketStart),
            end: bucketEnd === Number.POSITIVE_INFINITY ? null : new Date(bucketEnd)
        };
    }

    if (mode === 'manual') {
        return {
            mode,
            key: `manual:${reset ? new Date(reset).toISOString() : (academicYear || 'all')}`,
            start: reset ? new Date(reset) : (start ? new Date(start) : null),
            end: end ? new Date(end) : null
        };
    }

    if (mode === 'term') {
        const term = semester || (nowDate.getMonth() >= 7 ? 1 : 2);
        const midpoint = start ? new Date(start).setMonth(new Date(start).getMonth() + 6) : null;
        const termStart = term === 2 && midpoint ? midpoint : (start || null);
        return withResetAnchor({
            mode,
            baseKey: `term:${academicYear || 'current'}:${term}`,
            start: termStart,
            end: term === 1 && midpoint ? new Date(midpoint) : (end ? new Date(end) : null),
            reset
        });
    }

    return withResetAnchor({
        mode: 'school_year',
        baseKey: `year:${academicYear || new Date(current).getFullYear()}`,
        start: start || null,
        end: end ? new Date(end) : null,
        reset
    });
};

/**
 * Picks the ladder step for the incident being logged.
 *
 * `priorCount` is how many counted incidents already exist for this student and
 * this behavior inside the window, so the new incident is occurrence
 * priorCount + 1. Rejected consequences still count; only voided and merged
 * incidents are excluded by the caller.
 */
export const suggestStep = ({ priorCount = 0, ladder = null, settings = null, now = new Date() } = {}) => {
    const steps = orderedSteps(ladder);
    const occurrence = Math.max(1, (parseInt(priorCount, 10) || 0) + 1);
    const voided = {
        occurrence,
        stepIndex: null,
        step: null,
        overflow: 'empty_ladder',
        flagForAdmin: true,
        ladderLength: 0,
        now
    };
    if (!steps.length) return voided;

    if (occurrence <= steps.length) {
        return {
            occurrence,
            stepIndex: occurrence - 1,
            step: steps[occurrence - 1],
            overflow: null,
            flagForAdmin: false,
            ladderLength: steps.length,
            now
        };
    }

    const overflow = ladder?.overflowBehavior
        || settings?.ladder?.overflowBehavior
        || 'flag_for_admin';
    return {
        occurrence,
        stepIndex: steps.length - 1,
        step: steps[steps.length - 1],
        overflow,
        flagForAdmin: overflow !== 'repeat_last',
        ladderLength: steps.length,
        now
    };
};

export const countBehaviorWords = (text = '') => String(text)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .length;

/**
 * A written task is acceptable once it reaches the ladder's minimum. Detention,
 * family meetings and suspensions have no word requirement.
 */
export const meetsWordMinimum = ({ text = '', minWords = 0 } = {}) => {
    const minimum = Math.max(parseInt(minWords, 10) || 0, 0);
    if (minimum === 0) return { ok: true, wordCount: countBehaviorWords(text), minWords: 0 };
    const wordCount = countBehaviorWords(text);
    return { ok: wordCount >= minimum, wordCount, minWords: minimum };
};

export const stepLabel = (step) => (step ? `Step ${step.order}: ${step.title}` : 'No configured step');
