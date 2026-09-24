import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { isCorrect, normalizeForGrading } from '../utils/spellingGrading.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';

const objectId = () => new mongoose.Types.ObjectId();

 test('normalizes case, Unicode compatibility, and whitespace', () => {
    assert.equal(normalizeForGrading('  Ｃat\t  House  '), 'cat house');
    assert.equal(isCorrect('  CAt\nHouse ', 'cat house'), true);
    assert.equal(isCorrect('cat hous', 'cat house'), false);
    assert.equal(normalizeForGrading(null), '');
});

test('SpellingWord requires school-scoped curriculum fields', () => {
    const word = new SpellingWord({
        school: objectId(),
        grade: 'G3',
        week: 2,
        category: 'Animals',
        word: 'otter',
        normalizedWord: 'otter',
        order: 1
    });

    assert.equal(word.validateSync(), undefined);
    assert.equal(SpellingWord.schema.path('school').isRequired, true);
    assert.ok(SpellingWord.schema.indexes().some(([fields, options]) => (
        fields.school === 1 && fields.grade === 1 && fields.week === 1 && fields.order === 1 && options.unique
    )));
});

test('SpellingRetestItem defaults pending state and requires due date', () => {
    const retest = new SpellingRetestItem({
        school: objectId(),
        student: objectId(),
        sourceWord: objectId(),
        wordSnapshot: 'otter',
        grade: 'G3',
        week: 2,
        category: 'Animals',
        sourceSession: objectId(),
        sourceAttempt: objectId(),
        dueAt: new Date()
    });

    assert.equal(retest.validateSync(), undefined);
    assert.equal(retest.status, 'pending');
    assert.equal(SpellingRetestItem.schema.path('dueAt').isRequired, true);
});

test('SpellingSession validates modes and preserves attempt idempotency data', () => {
    const session = new SpellingSession({
        school: objectId(),
        student: objectId(),
        mode: 'self-serve',
        maxMistakesAllowed: 3,
        retestDeadline: new Date(Date.now() + 86400000),
        createdBy: objectId(),
        attempts: [{
            sequence: 1,
            wordId: objectId(),
            wordSnapshot: 'otter',
            grade: 'G3',
            week: 2,
            category: 'Animals',
            correct: false,
            studentInput: 'oter',
            normalizedInput: 'oter',
            idempotencyKey: 'attempt-1'
        }]
    });

    assert.equal(session.validateSync(), undefined);
    assert.equal(session.attempts[0].idempotencyKey, 'attempt-1');
    assert.equal(SpellingSession.schema.path('mode').enumValues.includes('teacher-led'), true);
});
