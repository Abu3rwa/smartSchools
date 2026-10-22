import test from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveCountingWindow,
    suggestStep,
    countBehaviorWords,
    meetsWordMinimum
} from '../services/behavior/suggestionService.js';
import { applyBehaviorTransition, canTransitionBehavior } from '../services/behavior/stateMachine.js';
import BehaviorAuditLog from '../models/BehaviorAuditLog.js';

const originalAuditCreate = BehaviorAuditLog.create;
const stubAudit = () => {
    const rows = [];
    BehaviorAuditLog.create = async (payload) => {
        rows.push(payload);
        return payload;
    };
    return rows;
};

const LADDER = {
    _id: 'ladder-1',
    overflowBehavior: 'repeat_last',
    steps: [
        { order: 1, title: 'Oops - talk it out', consequences: [] },
        { order: 2, title: 'Written warning', consequences: [] },
        { order: 3, title: 'Apology letter', consequences: [] },
        { order: 4, title: 'Serious - team meeting', consequences: [] }
    ]
};

test('resolveCountingWindow buckets rolling_days windows from the reset anchor', () => {
    const first = resolveCountingWindow({
        mode: 'rolling_days',
        rollingDays: 30,
        now: new Date('2026-09-14T10:00:00.000Z'),
        lastResetAt: new Date('2026-08-15T00:00:00.000Z')
    });
    assert.equal(first.mode, 'rolling_days');
    assert.ok(first.key.startsWith('rolling:30:2026-08-15T00:00:00.000Z'), first.key);
    assert.ok(first.start <= new Date('2026-09-14T10:00:00.000Z'));

    // The next 30-day bucket must be a different key so counts restart.
    const later = resolveCountingWindow({
        mode: 'rolling_days',
        rollingDays: 30,
        now: new Date('2026-10-20T10:00:00.000Z'),
        lastResetAt: new Date('2026-08-15T00:00:00.000Z')
    });
    assert.notEqual(later.key, first.key);
});

test('resolveCountingWindow uses the academic year window and reset marker', () => {
    const window = resolveCountingWindow({
        mode: 'school_year',
        academicYear: '2026-2027',
        yearStart: new Date('2026-08-01T00:00:00.000Z'),
        yearEnd: new Date('2027-07-31T00:00:00.000Z'),
        lastResetAt: new Date('2026-10-01T00:00:00.000Z')
    });

    assert.equal(window.key, 'year:2026-2027:reset-2026-10-01T00:00:00.000Z');
    assert.deepEqual(window.start, new Date('2026-10-01T00:00:00.000Z'));
});

test('resolveCountingWindow without a reset keeps the plain year window', () => {
    const window = resolveCountingWindow({
        mode: 'school_year',
        academicYear: '2026-2027',
        yearStart: new Date('2026-08-01T00:00:00.000Z'),
        yearEnd: new Date('2027-07-31T00:00:00.000Z')
    });
    assert.equal(window.key, 'year:2026-2027');
    assert.deepEqual(window.start, new Date('2026-08-01T00:00:00.000Z'));
});

test('resolveCountingWindow manual mode keeps one open-ended bucket', () => {
    const window = resolveCountingWindow({ mode: 'manual', now: new Date('2026-10-22T00:00:00.000Z') });
    assert.equal(window.key, 'manual:all');
    assert.equal(window.end, null);
});

test('suggestStep escalates one step per occurrence', () => {
    assert.equal(suggestStep({ priorCount: 0, ladder: LADDER }).step.order, 1);
    assert.equal(suggestStep({ priorCount: 1, ladder: LADDER }).step.order, 2);
    assert.equal(suggestStep({ priorCount: 3, ladder: LADDER }).step.order, 4);
});

test('suggestStep clamps at the last step and flags the overflow', () => {
    const beyond = suggestStep({ priorCount: 7, ladder: LADDER });
    assert.equal(beyond.step.order, 4);
    assert.equal(beyond.overflow, 'repeat_last');
    assert.equal(beyond.occurrence, 8);
});

test('suggestStep flags an administrator when the ladder is configured to', () => {
    const flagged = suggestStep({
        priorCount: 5,
        ladder: { ...LADDER, overflowBehavior: 'flag_for_admin' }
    });
    assert.equal(flagged.overflow, 'flag_for_admin');
    assert.equal(flagged.flagForAdmin, true);
});

test('suggestStep on an empty ladder does not invent a consequence', () => {
    const empty = suggestStep({ priorCount: 0, ladder: { _id: 'l', steps: [], overflowBehavior: 'repeat_last' } });
    assert.equal(empty.step, null);
    assert.equal(empty.overflow, 'empty_ladder');
    assert.equal(empty.flagForAdmin, true);
});

test('countBehaviorWords counts Arabic and ignores punctuation-only text', () => {
    assert.equal(countBehaviorWords('I am sorry for taking the phone.'), 7);
    assert.equal(countBehaviorWords('أنا آسف على ما فعلته'), 5);
    assert.equal(countBehaviorWords('... !!! '), 0);
});

test('meetsWordMinimum reports the shortfall the server will reject', () => {
    const short = meetsWordMinimum({ text: 'one two three', minWords: 100 });
    assert.equal(short.ok, false);
    assert.equal(short.wordCount, 3);
    assert.equal(meetsWordMinimum({ text: 'a'.repeat(10), minWords: 0 }).ok, true);
});

const fakeIncident = (status) => {
    const doc = {
        _id: 'inc-1',
        school: 'school-1',
        status,
        closedAt: null,
        set(key, value) {
            this[key] = value;
        },
        save: async () => doc
    };
    return doc;
};

test('illegal status hops are refused by the state machine', async () => {
    assert.equal(canTransitionBehavior('pending_approval', 'in_progress'), false);
    assert.equal(canTransitionBehavior('voided', 'logged'), false);

    await assert.rejects(
        () => applyBehaviorTransition({ incident: fakeIncident('voided'), to: 'logged' }),
        (error) => error.code === 'INVALID_TRANSITION' && error.statusCode === 400
    );
});

test('a same-state transition is a no-op instead of a second audit row', async () => {
    const rows = stubAudit();
    try {
        const incident = fakeIncident('in_progress');
        const result = await applyBehaviorTransition({ incident, to: 'in_progress' });
        assert.equal(result.status, 'in_progress');
        assert.equal(rows.length, 0);
    } finally {
        BehaviorAuditLog.create = originalAuditCreate;
    }
});

test('closing an incident stamps closedAt once and audits the hop', async () => {
    const rows = stubAudit();
    try {
        const incident = fakeIncident('in_progress');
        await applyBehaviorTransition({ incident, to: 'closed', actor: { _id: 'u-1', role: 'admin' } });
        assert.equal(incident.status, 'closed');
        assert.ok(incident.closedAt instanceof Date);
        assert.equal(rows.length, 1);
        // Only ids and statuses are recorded, never notes or names.
        assert.deepEqual(rows[0].before, { status: 'in_progress' });
        assert.equal(rows[0].meta, null);
    } finally {
        BehaviorAuditLog.create = originalAuditCreate;
    }
});
