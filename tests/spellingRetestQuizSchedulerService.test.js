import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingClassSettings from '../models/SpellingClassSettings.js';
import SpellingLibraryState from '../models/SpellingLibraryState.js';
import SpellingRetestEvent from '../models/SpellingRetestEvent.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import {
    scheduleDueSpellingRetestQuizzes,
    selectRetestQuizItems
} from '../services/spellingRetestQuizSchedulerService.js';

test('retest quiz selection includes every due word and prioritizes least-confident words', () => {
    const items = [
        { _id: 'more-confident', correctRetestStreak: 2, incorrectRetestCount: 0, lastRetestedAt: null, dueAt: new Date('2026-10-01'), flaggedAt: new Date('2026-09-01') },
        { _id: 'least-confident', correctRetestStreak: 0, incorrectRetestCount: 2, lastRetestedAt: new Date('2026-10-01'), dueAt: new Date('2026-10-02'), flaggedAt: new Date('2026-09-20') },
        { _id: 'some-confidence', correctRetestStreak: 1, incorrectRetestCount: 0, lastRetestedAt: new Date('2026-09-10'), dueAt: new Date('2026-10-04'), flaggedAt: new Date('2026-09-02') }
    ];

    assert.deepEqual(selectRetestQuizItems(items).map((item) => item._id), ['least-confident', 'some-confidence', 'more-confident']);
});

test('retest quiz selection uses earliest missed words when review history is equal', () => {
    const items = [
        { _id: 'newer', lastRetestedAt: null, dueAt: new Date('2026-10-02'), flaggedAt: new Date('2026-09-02') },
        { _id: 'older', lastRetestedAt: null, dueAt: new Date('2026-10-02'), flaggedAt: new Date('2026-09-01') }
    ];

    assert.deepEqual(selectRetestQuizItems(items).map((item) => item._id), ['older', 'newer']);
});

test('scheduling a due quiz records a schedule event for every advanced retest', async (t) => {
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const sourceWord = new mongoose.Types.ObjectId();
    const dueAt = new Date('2026-11-20T00:00:00.000Z');
    const now = new Date('2026-11-24T12:00:00.000Z');
    const row = {
        _id: new mongoose.Types.ObjectId(),
        school: schoolId,
        student: studentId,
        sourceWord,
        status: 'pending',
        grade: 'G2',
        week: 3,
        wordSnapshot: 'otter',
        correctRetestStreak: 0,
        incorrectRetestCount: 1,
        dueAt,
        lastRetestedAt: null,
        practiceMasteredAt: null,
        practiceMasteredBySession: null,
        resolvedAt: null,
        resolvedBySession: null,
        suppressedAt: null,
        wordRevision: 1,
        revision: 1,
        save: async () => {}
    };
    const events = [];
    const chain = (result) => ({
        select() {
            return this;
        },
        sort() {
            return this;
        },
        limit() {
            return this;
        },
        setOptions() {
            return this;
        },
        session() {
            return this;
        },
        lean: async () => result,
        then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    });

    t.mock.method(mongoose, 'startSession', async () => ({
        withTransaction: async (callback) => callback(),
        endSession: async () => {}
    }));
    t.mock.method(SpellingRetestItem, 'find', () => chain([row]));
    t.mock.method(SpellingRetestItem, 'findOne', () => chain(row));
    t.mock.method(Student, 'findOne', () => chain({ _id: studentId, user: null, currentClass: null, enrolledClasses: [] }));
    t.mock.method(SpellingClassSettings, 'findOne', () => chain(null));
    t.mock.method(SpellingSession, 'findOne', () => chain(null));
    t.mock.method(SpellingSession, 'create', async ([doc]) => ([{ ...doc, _id: new mongoose.Types.ObjectId(), emailNotification: 'none' }]));
    t.mock.method(SpellingSession, 'updateOne', async () => ({ matchedCount: 1 }));
    t.mock.method(SpellingLibraryState, 'findOneAndUpdate', async () => ({ version: 1, coordinationRevision: 0 }));
    t.mock.method(SpellingRetestEvent, 'findOne', () => chain(null));
    t.mock.method(SpellingRetestEvent, 'create', async ([event]) => {
        const stored = { ...event, sequence: events.length + 1 };
        events.push(stored);
        return [stored];
    });

    const result = await scheduleDueSpellingRetestQuizzes({ now });
    assert.equal(result.quizzesScheduled, 1);
    assert.equal(result.wordsScheduled, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, 'schedule');
    assert.equal(events[0].after.dueAt.getTime(), new Date('2026-12-01T12:00:00.000Z').getTime());
    assert.equal(row.dueAt.getTime(), new Date('2026-12-01T12:00:00.000Z').getTime());
    assert.equal(row.lastRetestedAt.getTime(), now.getTime());
});
