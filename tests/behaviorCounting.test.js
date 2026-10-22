import test from 'node:test';
import assert from 'node:assert/strict';

import BehaviorCounter from '../models/BehaviorCounter.js';
import BehaviorCountReset from '../models/BehaviorCountReset.js';
import BehaviorIncident from '../models/BehaviorIncident.js';
import {
    buildCountingWindow,
    previewOccurrence,
    reserveOccurrence
} from '../services/behavior/counterService.js';

const originals = {
    counterFindOne: BehaviorCounter.findOne,
    counterUpdate: BehaviorCounter.findOneAndUpdate,
    resetFindOne: BehaviorCountReset.findOne,
    incidentCount: BehaviorIncident.countDocuments
};

const restore = () => {
    BehaviorCounter.findOne = originals.counterFindOne;
    BehaviorCounter.findOneAndUpdate = originals.counterUpdate;
    BehaviorCountReset.findOne = originals.resetFindOne;
    BehaviorIncident.countDocuments = originals.incidentCount;
};

const LADDER = {
    _id: 'ladder-1',
    overflowBehavior: 'repeat_last',
    steps: [
        { order: 1, title: 'Oops' },
        { order: 2, title: 'Written warning' },
        { order: 3, title: 'Apology letter' }
    ]
};

const SETTINGS = { counting: { mode: 'school_year', rollingDays: 90, academicYear: null } };
const YEAR_BOUNDS = {
    academicYear: '2026-2027',
    start: new Date('2026-08-01T00:00:00.000Z'),
    end: new Date('2027-07-31T00:00:00.000Z'),
    semester: 1
};

const noReset = () => {
    BehaviorCountReset.findOne = () => ({
        sort: () => ({ select: () => ({ lean: async () => null }) })
    });
};

test('the counting window follows the school-year setting', async () => {
    noReset();
    const window = await buildCountingWindow({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        settings: SETTINGS,
        yearBounds: YEAR_BOUNDS
    });

    assert.equal(window.key, 'year:2026-2027');
    restore();
});

test('a reset marker moves the window to a fresh bucket', async () => {
    BehaviorCountReset.findOne = () => ({
        sort: () => ({
            select: () => ({
                lean: async () => ({ resetAt: new Date('2026-10-05T00:00:00.000Z'), behaviorType: null })
            })
        })
    });

    const window = await buildCountingWindow({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        settings: SETTINGS,
        yearBounds: YEAR_BOUNDS
    });

    assert.match(window.key, /reset-2026-10-05/);
    restore();
});

test('a brand-new counter bucket adopts the existing history once', async () => {
    noReset();
    let counted = 0;
    BehaviorIncident.countDocuments = async () => {
        counted += 1;
        return 2;
    };

    let stored = null;
    BehaviorCounter.findOne = () => ({
        select: () => ({ lean: async () => stored })
    });
    BehaviorCounter.findOneAndUpdate = async (filter, update) => {
        if (update.$setOnInsert) {
            stored = { count: update.$setOnInsert.count, windowKey: filter.windowKey };
            return stored;
        }
        stored = { ...stored, count: stored.count + update.$inc.count };
        return stored;
    };

    const window = await buildCountingWindow({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        settings: SETTINGS,
        yearBounds: YEAR_BOUNDS
    });

    const first = await reserveOccurrence({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        window
    });
    assert.equal(first.occurrence, 3, 'history held 2, so this is the third');
    assert.equal(first.priorCount, 2);
    assert.equal(counted, 1, 'the recount only happens while seeding the bucket');

    const second = await reserveOccurrence({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        window
    });
    assert.equal(second.occurrence, 4);
    assert.equal(counted, 1, 'steady state must not re-scan incidents');
    restore();
});

test('concurrent reservations take different occurrence numbers', async () => {
    noReset();
    BehaviorIncident.countDocuments = async () => 0;

    let stored = null;
    BehaviorCounter.findOne = () => ({ select: () => ({ lean: async () => stored }) });
    BehaviorCounter.findOneAndUpdate = async (filter, update) => {
        if (update.$setOnInsert) {
            if (stored) {
                // A competing insert hits the unique index, exactly like prod.
                throw Object.assign(new Error('duplicate'), { code: 11000 });
            }
            stored = { count: update.$setOnInsert.count, windowKey: filter.windowKey };
            return stored;
        }
        stored = { ...stored, count: stored.count + update.$inc.count };
        return stored;
    };

    const window = { mode: 'school_year', key: 'year:2026-2027', start: null, end: null };
    const results = await Promise.all([
        reserveOccurrence({ schoolId: 's', studentId: 'st', behaviorTypeId: 'b', window }),
        reserveOccurrence({ schoolId: 's', studentId: 'st', behaviorTypeId: 'b', window })
    ]);

    assert.deepEqual(results.map((entry) => entry.occurrence).sort(), [1, 2]);
    restore();
});

test('preview suggests a step without reserving an occurrence', async () => {
    noReset();
    BehaviorCounter.findOne = () => ({
        select: () => ({ lean: async () => ({ count: 1 }) })
    });
    let reserved = 0;
    BehaviorCounter.findOneAndUpdate = async () => {
        reserved += 1;
        return { count: 2 };
    };

    const window = { mode: 'school_year', key: 'year:2026-2027', start: null, end: null };
    const preview = await previewOccurrence({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        ladder: LADDER,
        settings: SETTINGS,
        window
    });

    assert.equal(preview.occurrence, 2);
    assert.equal(preview.step.order, 2);
    assert.equal(reserved, 0, 'the logging screen must never move the counter');
    restore();
});

test('preview past the last step reports the overflow instead of inventing a step', async () => {
    noReset();
    BehaviorCounter.findOne = () => ({
        select: () => ({ lean: async () => ({ count: 9 }) })
    });

    const window = { mode: 'school_year', key: 'year:2026-2027', start: null, end: null };
    const preview = await previewOccurrence({
        schoolId: 'school-1',
        studentId: 'stu-1',
        behaviorTypeId: 'bt-1',
        ladder: LADDER,
        settings: SETTINGS,
        window
    });

    assert.equal(preview.step.order, 3);
    assert.equal(preview.overflow, 'repeat_last');
    assert.equal(preview.flagForAdmin, false);
    restore();
});
