import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import SpellingRetestEvent from '../models/SpellingRetestEvent.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import { snapshotRetestState } from '../services/spellingRetestStateService.js';

const buildRetestItem = () => new SpellingRetestItem({
    school: new mongoose.Types.ObjectId(),
    student: new mongoose.Types.ObjectId(),
    sourceWord: new mongoose.Types.ObjectId(),
    wordSnapshot: 'otter',
    grade: 'G5',
    week: 1,
    category: 'Curriculum',
    sourceSession: new mongoose.Types.ObjectId(),
    sourceAttempt: new mongoose.Types.ObjectId(),
    dueAt: new Date('2026-12-01T00:00:00.000Z')
});

const buildSessionWithRetestAttempt = (retestItem) => new SpellingSession({
    school: new mongoose.Types.ObjectId(),
    student: new mongoose.Types.ObjectId(),
    createdBy: new mongoose.Types.ObjectId(),
    mode: 'self-serve',
    assessmentType: 'spelling-assessment',
    status: 'in-progress',
    curriculumGrade: 'G5',
    curriculumWeek: 1,
    maxMistakesAllowed: 3,
    retestDeadline: new Date('2026-12-01T00:00:00.000Z'),
    attempts: [{
        sequence: 1,
        wordId: retestItem.sourceWord,
        retestItemId: retestItem._id,
        isRetest: true,
        wordSnapshot: retestItem.wordSnapshot,
        grade: retestItem.grade,
        week: retestItem.week,
        category: retestItem.category,
        correct: false,
        idempotencyKey: 'session-1-1',
        // Exactly the shape recordSpellingAttempt stores.
        retestSnapshot: [{
            retestItemId: retestItem._id,
            ...snapshotRetestState(retestItem)
        }]
    }]
});

test('the attempt retest snapshot carries the item revision the session schema requires', () => {
    const item = buildRetestItem();
    const snapshot = snapshotRetestState(item);
    assert.equal(snapshot.revision, 1);
});

test('a student attempt that touches a retest item passes session validation', () => {
    const session = buildSessionWithRetestAttempt(buildRetestItem());
    assert.equal(session.validateSync(), undefined);
});

test('retest events still validate with the revision in their snapshot', () => {
    const item = buildRetestItem();
    const event = new SpellingRetestEvent({
        school: item.school,
        student: item.student,
        sourceWord: item.sourceWord,
        sequence: 1,
        kind: 'baseline',
        before: null,
        after: snapshotRetestState(item),
        retestItemIds: [item._id],
        sourceSession: item.sourceSession,
        sourceAttempt: item.sourceAttempt,
        occurredAt: new Date('2026-11-25T08:00:00.000Z')
    });
    assert.equal(event.validateSync(), undefined);
});
