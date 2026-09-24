import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import { getCurrentSpellingItem, recordSpellingAttempt, startSpellingSession } from '../services/spellingSessionService.js';

const enabled = process.env.RUN_SPELLING_INTEGRATION === 'true' && Boolean(process.env.MONGODB_URI);
const integrationTest = enabled ? test : test.skip;
const ids = [];

integrationTest('session transitions are stable and concurrent duplicate answers are rejected', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    ids.push({ schoolId, studentId });

    await Student.create({
        _id: studentId,
        school: schoolId,
        studentId: `spelling-${studentId}`,
        firstName: 'Spelling',
        lastName: 'Integration',
        dateOfBirth: new Date('2015-01-01'),
        gender: 'other',
        academicYear: 'integration',
        spelling: { currentGrade: 'G3', currentWeek: 1, lastWordIndex: 0, defaultMaxMistakes: 1 }
    });
    await SpellingWord.create({
        school: schoolId,
        grade: 'G3',
        week: 1,
        category: 'Integration',
        word: 'otter',
        normalizedWord: 'otter',
        order: 1
    });

    const session = await startSpellingSession({ schoolId, studentId, userId, mode: 'self-serve', maxMistakesAllowed: 1 });
    const [first, second] = await Promise.all([
        getCurrentSpellingItem({ schoolId, sessionId: session._id }),
        getCurrentSpellingItem({ schoolId, sessionId: session._id })
    ]);
    assert.equal(first.item.word, 'otter');
    assert.equal(second.item.sequence, first.item.sequence);

    const results = await Promise.allSettled([
        recordSpellingAttempt({ schoolId, sessionId: session._id, userId, sequence: 1, studentInput: 'oter', idempotencyKey: 'integration-a' }),
        recordSpellingAttempt({ schoolId, sessionId: session._id, userId, sequence: 1, studentInput: 'otter', idempotencyKey: 'integration-b' })
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);

    const savedSession = await SpellingSession.findOne({ _id: session._id, school: schoolId }).lean();
    assert.equal(savedSession.status, 'completed');
    assert.equal(savedSession.attempts.length, 1);
    assert.equal(await SpellingRetestItem.countDocuments({ school: schoolId, student: studentId, status: 'pending' }), 1);
}, { timeout: 30000 });

test.after(async () => {
    if (!enabled) return;
    for (const { schoolId, studentId } of ids) {
        await Promise.all([
            Student.deleteOne({ _id: studentId, school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingWord.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingSession.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingRetestItem.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true })
        ]);
    }
    await mongoose.disconnect();
});
