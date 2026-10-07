import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingClassSession from '../models/SpellingClassSession.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingIntegrityEvent from '../models/SpellingIntegrityEvent.js';
import { completeSpellingSession, getCurrentSpellingItem, markSpellingAttemptCorrect, recordSpellingAttempt, startSpellingClassSession, startSpellingSession } from '../services/spellingSessionService.js';
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
    assert.equal(rosterSessions[0].currentWordGrade, 'G3');
    assert.equal(rosterSessions[0].currentWordWeek, 1);
    assert.equal(rosterSessions[0].currentWordIsRetest, false);
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

integrationTest('completed grades promote students to the next grade and G5 remains terminal', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const schoolId = new mongoose.Types.ObjectId();
    const kindergartenStudentId = new mongoose.Types.ObjectId();
    const terminalStudentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    ids.push({ schoolId, studentId: kindergartenStudentId, extraStudentIds: [terminalStudentId] });

    await Student.create([
        {
            _id: kindergartenStudentId,
            school: schoolId,
            studentId: `spelling-kg-complete-${kindergartenStudentId}`,
            firstName: 'Kindergarten',
            lastName: 'Complete',
            dateOfBirth: new Date('2015-01-01'),
            gender: 'other',
            academicYear: 'integration',
            spelling: {
                currentGrade: 'KG',
                currentWeek: 40,
                lastWordIndex: 1,
                progressByGrade: [{ grade: 'KG', week: 40, lastWordIndex: 1 }]
            }
        },
        {
            _id: terminalStudentId,
            school: schoolId,
            studentId: `spelling-g5-complete-${terminalStudentId}`,
            firstName: 'Grade Five',
            lastName: 'Complete',
            dateOfBirth: new Date('2015-01-01'),
            gender: 'other',
            academicYear: 'integration',
            spelling: {
                currentGrade: 'G5',
                currentWeek: 36,
                lastWordIndex: 1,
                progressByGrade: [{ grade: 'G5', week: 36, lastWordIndex: 1 }]
            }
        }
    ]);
    await SpellingWord.create([
        { school: schoolId, grade: 'KG', week: 40, category: 'Integration', word: 'kindergarten', normalizedWord: 'kindergarten', order: 1 },
        { school: schoolId, grade: 'G1', week: 1, category: 'Integration', word: 'firstgrade', normalizedWord: 'firstgrade', order: 1 },
        { school: schoolId, grade: 'G5', week: 36, category: 'Integration', word: 'terminal', normalizedWord: 'terminal', order: 1 }
    ]);

    const promotedSession = await startSpellingSession({
        schoolId,
        studentId: kindergartenStudentId,
        userId,
        mode: 'self-serve',
        maxMistakesAllowed: 3,
        curriculumGrade: 'KG'
    });
    assert.equal(promotedSession.curriculumGrade, 'G1');
    assert.equal(promotedSession.curriculumWeek, 1);
    const promotedStudent = await Student.findById(kindergartenStudentId).lean();
    assert.equal(promotedStudent.spelling.currentGrade, 'G1');
    assert.equal(promotedStudent.spelling.currentWeek, 1);
    assert.equal(promotedStudent.spelling.progressByGrade.find((entry) => entry.grade === 'KG').week, 40);

    await assert.rejects(
        () => startSpellingSession({
            schoolId,
            studentId: terminalStudentId,
            userId,
            mode: 'self-serve',
            maxMistakesAllowed: 3,
            curriculumGrade: 'G5'
        }),
        (error) => error.statusCode === 400 && /completed all available spelling grades \(G5\)/.test(error.message)
    );
}, { timeout: 30000 });

integrationTest('starting a new grade ignores another grade legacy progress and repairs out-of-range weeks', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const schoolId = new mongoose.Types.ObjectId();
    const studentIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const userId = new mongoose.Types.ObjectId();
    ids.push({ schoolId, studentId: studentIds[0], extraStudentIds: [studentIds[1]] });

    await Student.create([
        {
            _id: studentIds[0],
            school: schoolId,
            studentId: `spelling-cross-grade-${studentIds[0]}`,
            firstName: 'Cross',
            lastName: 'Grade',
            dateOfBirth: new Date('2015-01-01'),
            gender: 'other',
            academicYear: 'integration',
            spelling: {
                currentGrade: 'G4',
                currentWeek: 11,
                lastWordIndex: 7,
                progressByGrade: [{ grade: 'KG', week: 11, lastWordIndex: 7 }]
            }
        },
        {
            _id: studentIds[1],
            school: schoolId,
            studentId: `spelling-invalid-week-${studentIds[1]}`,
            firstName: 'Invalid',
            lastName: 'Week',
            dateOfBirth: new Date('2015-01-01'),
            gender: 'other',
            academicYear: 'integration',
            spelling: { currentGrade: 'G1', currentWeek: 38, lastWordIndex: 0 }
        }
    ]);
    await SpellingWord.create([
        { school: schoolId, grade: 'G4', week: 1, category: 'Integration', word: 'gradefour', normalizedWord: 'gradefour', order: 1 },
        { school: schoolId, grade: 'G1', week: 1, category: 'Integration', word: 'gradeone', normalizedWord: 'gradeone', order: 1 }
    ]);

    const firstGradeSession = await startSpellingSession({
        schoolId,
        studentId: studentIds[0],
        userId,
        mode: 'self-serve',
        maxMistakesAllowed: 3,
        curriculumGrade: 'G4'
    });
    assert.equal(firstGradeSession.curriculumGrade, 'G4');
    assert.equal(firstGradeSession.curriculumWeek, 1);

    const recoveredSession = await startSpellingSession({
        schoolId,
        studentId: studentIds[1],
        userId,
        mode: 'self-serve',
        maxMistakesAllowed: 3,
        curriculumGrade: 'G1'
    });
    assert.equal(recoveredSession.curriculumGrade, 'G1');
    assert.equal(recoveredSession.curriculumWeek, 1);
    const repairedStudent = await Student.findById(studentIds[1]).lean();
    assert.equal(repairedStudent.spelling.currentWeek, null);
    assert.equal(repairedStudent.spelling.lastWordIndex, 0);
}, { timeout: 30000 });

integrationTest('teachers can correct a wrong answer after completion and resolve its retest', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const schoolId = new mongoose.Types.ObjectId();
    const studentId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    ids.push({ schoolId, studentId });

    await Student.create({
        _id: studentId,
        school: schoolId,
        studentId: `spelling-correction-${studentId}`,
        firstName: 'Spelling',
        lastName: 'Correction',
        dateOfBirth: new Date('2015-01-01'),
        gender: 'other',
        academicYear: 'integration',
        spelling: { currentGrade: 'G1', currentWeek: 1, lastWordIndex: 0 }
    });
    const word = await SpellingWord.create({
        school: schoolId,
        grade: 'G1',
        week: 1,
        category: 'Integration',
        word: 'otter',
        normalizedWord: 'otter',
        order: 1
    });
    const session = await startSpellingSession({
        schoolId,
        studentId,
        userId,
        mode: 'self-serve',
        maxMistakesAllowed: 1,
        curriculumGrade: 'G1'
    });
    const current = await getCurrentSpellingItem({ schoolId, sessionId: session._id });
    await recordSpellingAttempt({
        schoolId,
        sessionId: session._id,
        userId,
        sequence: current.item.sequence,
        studentInput: 'other',
        idempotencyKey: 'correction-test'
    });

    const completedSession = await SpellingSession.findById(session._id).lean();
    assert.equal(completedSession.status, 'completed');
    assert.equal(completedSession.mistakeCount, 1);
    assert.equal(completedSession.attempts[0].order, 1);
    const retest = await SpellingRetestItem.findOne({ school: schoolId, student: studentId, status: 'pending' }).lean();
    assert.ok(retest);

    const corrected = await markSpellingAttemptCorrect({
        schoolId,
        sessionId: session._id,
        attemptId: completedSession.attempts[0]._id,
        userId
    });
    assert.equal(corrected.session.status, 'completed');
    assert.equal(corrected.session.correctCount, 1);
    assert.equal(corrected.session.mistakeCount, 0);
    assert.equal(corrected.attempt.correct, true);
    assert.ok(corrected.attempt.correctedAt);
    assert.equal(await SpellingRetestItem.countDocuments({ school: schoolId, student: studentId, status: 'pending' }), 0);
    assert.equal(await SpellingRetestItem.countDocuments({ _id: retest._id, sourceWord: word._id, status: 'resolved' }), 1);

    const repeatedCorrection = await markSpellingAttemptCorrect({
        schoolId,
        sessionId: session._id,
        attemptId: completedSession.attempts[0]._id,
        userId
    });
    assert.equal(repeatedCorrection.idempotent, true);
    assert.equal(repeatedCorrection.session.correctCount, 1);
    assert.equal(repeatedCorrection.session.mistakeCount, 0);
}, { timeout: 30000 });

integrationTest('class spelling sessions share and resume ordered words independently by grade', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const schoolId = new mongoose.Types.ObjectId();
    const classId = new mongoose.Types.ObjectId();
    const studentIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const userId = new mongoose.Types.ObjectId();
    ids.push({ schoolId, studentId: studentIds[0], extraStudentIds: [studentIds[1]] });

    await Student.create(studentIds.map((studentId, index) => ({
        _id: studentId,
        school: schoolId,
        studentId: `spelling-class-${studentId}`,
        firstName: `Class${index + 1}`,
        lastName: 'Student',
        dateOfBirth: new Date('2015-01-01'),
        gender: 'other',
        academicYear: 'integration'
    })));
    const words = await SpellingWord.create([
        { school: schoolId, grade: 'KG', week: 1, category: 'Integration', word: 'otter', normalizedWord: 'otter', order: 1 },
        { school: schoolId, grade: 'KG', week: 1, category: 'Integration', word: 'rabbit', normalizedWord: 'rabbit', order: 2 },
        { school: schoolId, grade: 'G1', week: 1, category: 'Integration', word: 'kitten', normalizedWord: 'kitten', order: 1 }
    ]);

    const started = await startSpellingClassSession({
        schoolId,
        classId,
        studentIds,
        userId,
        mode: 'self-serve',
        curriculumGrade: 'KG'
    });
    const [firstItem, secondItem] = await Promise.all(started.sessions.map((session) =>
        getCurrentSpellingItem({ schoolId, sessionId: session._id })
    ));
    assert.equal(firstItem.item.word, 'otter');
    assert.equal(secondItem.item.word, 'otter');

    await recordSpellingAttempt({
        schoolId,
        sessionId: started.sessions[0]._id,
        userId,
        sequence: firstItem.item.sequence,
        studentInput: 'otter',
        idempotencyKey: `${started.sessions[0]._id}-1`
    });
    const waitingItem = await getCurrentSpellingItem({ schoolId, sessionId: started.sessions[0]._id });
    assert.equal(waitingItem.item.alreadyCompleted, true);

    await recordSpellingAttempt({
        schoolId,
        sessionId: started.sessions[1]._id,
        userId,
        sequence: secondItem.item.sequence,
        studentInput: 'wrong',
        idempotencyKey: `${started.sessions[1]._id}-1`
    });
    const [nextFirst, nextSecond] = await Promise.all(started.sessions.map((session) =>
        getCurrentSpellingItem({ schoolId, sessionId: session._id })
    ));
    assert.equal(nextFirst.item.word, 'rabbit');
    assert.equal(nextSecond.item.word, 'rabbit');
    assert.equal(nextFirst.item.sequence, 2);
    assert.equal(nextSecond.item.sequence, 2);
    assert.equal(words.length, 3);

    await Promise.all(started.sessions.map((session) =>
        completeSpellingSession({ schoolId, sessionId: session._id, reason: 'teacher-ended' })
    ));
    const gradeOne = await startSpellingClassSession({
        schoolId, classId, studentIds, userId, mode: 'self-serve', curriculumGrade: 'G1'
    });
    const gradeOneItems = await Promise.all(gradeOne.sessions.map((session) =>
        getCurrentSpellingItem({ schoolId, sessionId: session._id })
    ));
    assert.deepEqual(gradeOneItems.map((result) => result.item.word), ['kitten', 'kitten']);
    await Promise.all(gradeOne.sessions.map((session) =>
        completeSpellingSession({ schoolId, sessionId: session._id, reason: 'teacher-ended' })
    ));

    const resumedKindergarten = await startSpellingClassSession({
        schoolId, classId, studentIds, userId, mode: 'self-serve', curriculumGrade: 'KG'
    });
    const resumedItems = await Promise.all(resumedKindergarten.sessions.map((session) =>
        getCurrentSpellingItem({ schoolId, sessionId: session._id })
    ));
    assert.deepEqual(resumedItems.map((result) => result.item.word), ['rabbit', 'rabbit']);
}, { timeout: 30000 });

test.after(async () => {
    if (!enabled) return;
    for (const { schoolId, studentId, extraStudentIds = [] } of ids) {
        await Promise.all([
            Student.deleteMany({ _id: { $in: [studentId, ...extraStudentIds] }, school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingWord.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingSession.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
            SpellingClassSession.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
                SpellingRetestItem.deleteMany({ school: schoolId }).setOptions({ skipTenantFilter: true }),
                SpellingIntegrityEvent.deleteMany({ school: schoolId, student: studentId }).setOptions({ skipTenantFilter: true })
        ]);
    }
    await mongoose.disconnect();
});
