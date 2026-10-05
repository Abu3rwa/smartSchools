import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingIntegrityEvent from '../models/SpellingIntegrityEvent.js';
import { completeSpellingSession, getCurrentSpellingItem, recordSpellingAttempt, startSpellingSession } from '../services/spellingSessionService.js';
import { listSpellingIntegrityEvents, listSpellingSessions, recordSpellingIntegrityEvent } from '../services/spellingReadService.js';

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
    assert.ok(session.currentItem.wordId);
    const [first, second] = await Promise.all([
        getCurrentSpellingItem({ schoolId, sessionId: session._id }),
        getCurrentSpellingItem({ schoolId, sessionId: session._id })
    ]);
    assert.equal(first.item.word, 'otter');
    assert.equal(second.item.sequence, first.item.sequence);
    const rosterSessions = await listSpellingSessions({ schoolId, studentIds: [studentId], viewerRole: 'teacher' });
    assert.equal(rosterSessions[0].currentWord, 'otter');
    assert.equal(rosterSessions[0].nextSequence, 1);

    const integrityEvent = {
        schoolId,
        studentId,
        sessionId: session._id,
        eventId: '6ab939b2-b1cd-4ea1-8031-bd40aa222222',
        sequence: first.item.sequence,
        occurredAt: new Date()
    };
    await recordSpellingIntegrityEvent(integrityEvent);
    await recordSpellingIntegrityEvent(integrityEvent);
    const integrityHistory = await listSpellingIntegrityEvents({ schoolId, sessionId: session._id });
    assert.equal(integrityHistory.count, 1);

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
    await assert.rejects(() => recordSpellingIntegrityEvent(integrityEvent), /Active spelling session not found/);
}, { timeout: 30000 });

integrationTest('self-serve grade progress resumes independently and skipped words do not create mistakes', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    ids.push({ schoolId, studentId });

    await Student.create({
        _id: studentId,
        school: schoolId,
        studentId: `spelling-progress-${studentId}`,
        firstName: 'Spelling',
        lastName: 'Progress',
        dateOfBirth: new Date('2015-01-01'),
        gender: 'other',
        academicYear: 'integration',
        spelling: { currentGrade: 'G1', currentWeek: 1, lastWordIndex: 0, defaultMaxMistakes: 3 }
    });
    await SpellingWord.create([
        { school: schoolId, grade: 'G1', week: 1, category: 'Integration', word: 'otter', normalizedWord: 'otter', order: 1 },
        { school: schoolId, grade: 'G1', week: 1, category: 'Integration', word: 'rabbit', normalizedWord: 'rabbit', order: 2 },
        { school: schoolId, grade: 'G1', week: 1, category: 'Integration', word: 'turtle', normalizedWord: 'turtle', order: 3 },
        { school: schoolId, grade: 'G2', week: 1, category: 'Integration', word: 'kitten', normalizedWord: 'kitten', order: 1 }
    ]);

    const firstSession = await startSpellingSession({
        schoolId, studentId, userId, mode: 'self-serve', maxMistakesAllowed: 3, curriculumGrade: 'G1'
    });
    let current = await getCurrentSpellingItem({ schoolId, sessionId: firstSession._id });
    assert.equal(current.item.word, 'otter');

    const skipped = await recordSpellingAttempt({
        schoolId,
        sessionId: firstSession._id,
        userId,
        sequence: current.item.sequence,
        studentInput: '',
        skipped: true,
        idempotencyKey: 'skip-otter'
    });
    assert.equal(skipped.attempt.skipped, true);
    assert.equal(skipped.session.mistakeCount, 0);
    assert.equal(await SpellingRetestItem.countDocuments({ school: schoolId, student: studentId, status: 'pending' }), 0);

    current = await getCurrentSpellingItem({ schoolId, sessionId: firstSession._id });
    assert.equal(current.item.word, 'rabbit');
    const punctuated = await recordSpellingAttempt({
        schoolId,
        sessionId: firstSession._id,
        userId,
        sequence: current.item.sequence,
        studentInput: 'rab!bit.',
        idempotencyKey: 'punctuated-rabbit'
    });
    assert.equal(punctuated.attempt.correct, true);

    current = await getCurrentSpellingItem({ schoolId, sessionId: firstSession._id });
    assert.equal(current.item.word, 'turtle');
    await completeSpellingSession({ schoolId, sessionId: firstSession._id });

    const secondGradeSession = await startSpellingSession({
        schoolId, studentId, userId, mode: 'self-serve', maxMistakesAllowed: 3, curriculumGrade: 'G2'
    });
    current = await getCurrentSpellingItem({ schoolId, sessionId: secondGradeSession._id });
    assert.equal(current.item.word, 'kitten');
    await completeSpellingSession({ schoolId, sessionId: secondGradeSession._id });

    const resumedFirstGradeSession = await startSpellingSession({
        schoolId, studentId, userId, mode: 'self-serve', maxMistakesAllowed: 3, curriculumGrade: 'G1'
    });
    current = await getCurrentSpellingItem({ schoolId, sessionId: resumedFirstGradeSession._id });
    assert.equal(current.item.word, 'turtle');
    await completeSpellingSession({ schoolId, sessionId: resumedFirstGradeSession._id });
}, { timeout: 30000 });

test.after(async () => {
    if (!enabled) return;
    for (const { schoolId, studentId } of ids) {
        await Promise.all([
            Student.deleteOne({ _id: studentId, school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingWord.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingSession.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
                SpellingRetestItem.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
                SpellingIntegrityEvent.deleteMany({ school: schoolId, student: studentId }).setOptions({ skipTenantFilter: true })
        ]);
    }
    await mongoose.disconnect();
});
