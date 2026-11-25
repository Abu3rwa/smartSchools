import { applyRetestAnswerPolicy } from './spellingRetestStateService.js';

/**
 * Pure replay of one student/source-word retest group.
 *
 * Every input event is replayed in sequence from the baseline that created the
 * row. `correction` events are derived output and are skipped. An answer event
 * whose producing attempt has a current override uses that override instead of
 * the recorded outcome, which is how undo restores the earlier state without
 * inverse arithmetic.
 */
export const REPLAYED_STATE_FIELDS = [
    'status',
    'correctRetestStreak',
    'incorrectRetestCount',
    'dueAt',
    'lastRetestedAt',
    'practiceMasteredAt',
    'practiceMasteredBySession',
    'resolvedAt',
    'resolvedBySession',
    'suppressedAt',
    'wordSnapshot',
    'wordRevision'
];

const OPEN_STATUSES = ['pending', 'practice-mastered'];

const timestamp = (value) => (value == null ? null : new Date(value).getTime());

const sameValue = (left, right) => {
    if (left == null && right == null) return true;
    if (left == null || right == null) return false;
    if (left instanceof Date || right instanceof Date) return timestamp(left) === timestamp(right);
    const leftId = String(left);
    const rightId = String(right);
    if (leftId === rightId) return true;
    const leftDate = timestamp(left);
    return Number.isFinite(leftDate) && leftDate === timestamp(right);
};

/** Differences that make a replay untrustworthy; empty means exact match. */
export const compareRetestStates = (actual, expected) => {
    const differences = [];
    for (const field of REPLAYED_STATE_FIELDS) {
        if (!sameValue(actual?.[field], expected?.[field])) {
            differences.push(field);
        }
    }
    return differences;
};

const initialState = (item, baseline) => ({
    status: 'pending',
    correctRetestStreak: 0,
    incorrectRetestCount: 0,
    dueAt: baseline?.after?.dueAt ?? item.dueAt ?? null,
    lastRetestedAt: null,
    practiceMasteredAt: null,
    practiceMasteredBySession: null,
    resolvedAt: null,
    resolvedBySession: null,
    suppressedAt: null,
    wordSnapshot: baseline?.after?.wordSnapshot ?? item.wordSnapshot ?? null,
    wordRevision: baseline?.after?.wordRevision ?? item.wordRevision ?? null
});

const applySnapshot = (state, snapshot) => {
    if (!snapshot) return;
    for (const field of REPLAYED_STATE_FIELDS) {
        if (Object.hasOwn(snapshot, field)) state[field] = snapshot[field] ?? null;
    }
};

const resolveOutcome = (event, overrides) => {
    const override = overrides.get(String(event.sourceAttempt));
    if (override) {
        return {
            correct: override.correct === true,
            skipped: override.skipped === true,
            formalTest: Boolean(override.formalTest ?? event.outcome?.formalTest)
        };
    }
    if (event.outcome && typeof event.outcome.correct === 'boolean') {
        return {
            correct: event.outcome.correct,
            skipped: event.outcome.skipped === true,
            formalTest: event.outcome.formalTest === true
        };
    }
    return null;
};

/**
 * @returns {{safe: true, states: Map} | {safe: false, reason: string}}
 * `unsafe` means the stored history cannot be replayed exactly; callers must
 * reject the correction without writing anything.
 */
export const replayRetestGroup = ({
    items,
    events,
    overrides = new Map(),
    applyAnswer = applyRetestAnswerPolicy
}) => {
    const baselines = new Map();
    for (const event of events) {
        if (event.kind === 'baseline') {
            for (const itemId of event.retestItemIds || []) baselines.set(String(itemId), event);
        }
    }

    const states = new Map();
    for (const item of items) {
        const itemId = String(item._id);
        const baseline = baselines.get(itemId);
        if (!baseline || !baseline.after) return { safe: false, reason: 'missing-baseline' };
        states.set(itemId, initialState(item, baseline));
    }

    for (const event of events) {
        if (event.kind === 'correction') continue;
        const targets = (event.retestItemIds || [])
            .map(String)
            .filter((itemId) => states.has(itemId));

        if (event.kind === 'baseline') continue;

        if (event.kind === 'answer') {
            const outcome = resolveOutcome(event, overrides);
            if (!outcome) return { safe: false, reason: 'missing-outcome' };
            if (outcome.skipped) continue;
            for (const itemId of targets) {
                const state = states.get(itemId);
                if (state.suppressedAt || !OPEN_STATUSES.includes(state.status)) continue;
                Object.assign(state, applyAnswer({
                    item: state,
                    correct: outcome.correct,
                    skipped: false,
                    formalTest: outcome.formalTest,
                    at: event.occurredAt,
                    sessionId: event.sourceSession
                }));
            }
            continue;
        }

        if (event.kind === 'typo') {
            for (const itemId of targets) {
                const state = states.get(itemId);
                if (event.after?.wordSnapshot != null) state.wordSnapshot = event.after.wordSnapshot;
                if (event.after?.wordRevision != null) state.wordRevision = event.after.wordRevision;
            }
            continue;
        }

        if (event.kind === 'schedule' || event.kind === 'teacher-override'
            || event.kind === 'legacy-practice-migration') {
            for (const itemId of targets) applySnapshot(states.get(itemId), event.after);
            continue;
        }

        return { safe: false, reason: `unsupported-${event.kind}` };
    }

    return { safe: true, states };
};
