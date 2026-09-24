import Student from '../models/Student.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import { withTransaction } from '../utils/withTransaction.js';
import { isCorrect, normalizeForGrading } from '../utils/spellingGrading.js';
import { queueSpellingCompletionEmail } from './spellingEmailService.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

const getCurrentItemData = async (session, dbSession) => {
    const attemptedSequences = new Set(session.attempts.map((attempt) => attempt.sequence));
    const attemptedWordIds = new Set(session.attempts.map((attempt) => String(attempt.wordId)).filter(Boolean));
    const attemptedRetestIds = new Set(session.attempts.map((attempt) => String(attempt.retestItemId)).filter(Boolean));
    const currentSequence = session.currentItem?.sequence;
    const currentWordId = session.currentItem?.wordId ? String(session.currentItem.wordId) : null;
    const currentRetestId = session.currentItem?.retestItemId ? String(session.currentItem.retestItemId) : null;

    if (
        !currentSequence ||
        attemptedSequences.has(currentSequence) ||
        (currentWordId && attemptedWordIds.has(currentWordId)) ||
        (currentRetestId && attemptedRetestIds.has(currentRetestId))
    ) {
        return null;
    }

    if (session.currentItem?.retestItemId) {
        const retestItem = await SpellingRetestItem.findOne({
            _id: session.currentItem.retestItemId,
            school: session.school,
            status: 'pending'
        }).session(dbSession).lean();
        if (retestItem) {
            return {
                wordId: retestItem.sourceWord,
                retestItemId: retestItem._id,
                sequence: session.currentItem.sequence,
                word: retestItem.wordSnapshot,
                grade: retestItem.grade,
                week: retestItem.week,
                category: retestItem.category,
                isRetest: true
            };
        }
    }

    if (session.currentItem?.wordId) {
        const word = await SpellingWord.findOne({
            _id: session.currentItem.wordId,
            school: session.school
        }).session(dbSession).lean();
        if (word) {
            return {
                wordId: word._id,
                retestItemId: null,
                sequence: session.currentItem.sequence,
                word: word.word,
                grade: word.grade,
                week: word.week,
                category: word.category,
                order: word.order,
                isRetest: false
            };
        }
    }

    return null;
};

export async function startSpellingSession({ schoolId, studentId, userId, mode, maxMistakesAllowed, retestDeadline, curriculumGrade, curriculumWeek, emailNotification = DEFAULT_SPELLING_EMAIL_AUDIENCE }) {
    if (!['teacher-led', 'self-serve'].includes(mode)) throw badRequest('Invalid spelling session mode');
    if (!Number.isInteger(maxMistakesAllowed) || maxMistakesAllowed < 1) throw badRequest('maxMistakesAllowed must be a positive integer');
    if (!isSpellingEmailAudience(emailNotification)) throw badRequest('Invalid spelling email audience');

    const startedAt = new Date();
    const deadline = retestDeadline ? new Date(retestDeadline) : new Date(startedAt.getTime() + (7 * DAY_MS));
    if (Number.isNaN(deadline.getTime()) || deadline < startedAt) throw badRequest('retestDeadline must be a valid future date');

    const student = await Student.findOne({ _id: studentId, school: schoolId }).lean();
    if (!student) throw notFound('Student not found');

    const activeSession = await SpellingSession.findOne({
        school: schoolId,
        student: studentId,
        status: 'in-progress'
    }).sort({ startedAt: -1 });
    if (activeSession) {
        if (activeSession.mode === mode) return activeSession;
        throw conflict('This student already has an active spelling session. End it before starting another session.');
    }

    const selectedGrade = curriculumGrade || student.spelling?.currentGrade;
    const selectedWeek = curriculumWeek || student.spelling?.currentWeek;
    if (!selectedGrade || !selectedWeek) {
        throw badRequest('Set the student spelling grade and week before starting an assessment');
    }
    const wordCount = await SpellingWord.countDocuments({
        school: schoolId,
        grade: selectedGrade,
        week: selectedWeek
    });
    if (wordCount === 0) {
        throw badRequest(`No spelling words are imported for ${selectedGrade}, week ${selectedWeek}`);
    }

    const session = await SpellingSession.create({
        school: schoolId,
        student: studentId,
        mode,
        maxMistakesAllowed,
        retestDeadline: deadline,
        curriculumGrade: selectedGrade,
        curriculumWeek: selectedWeek,
        emailNotification,
        startedAt,
        createdBy: userId,
        administeredBy: mode === 'teacher-led' ? userId : null
    });

    return session;
}

export async function getCurrentSpellingItem({ schoolId, sessionId }) {
    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');
        if (session.status !== 'in-progress') return { session, item: null };

        const existing = await getCurrentItemData(session, dbSession);
        if (existing) return { session, item: existing };

        const student = await Student.findOne({ _id: session.student, school: schoolId }).session(dbSession).lean();
        if (!student) throw notFound('Student not found');

        const attemptedWordIds = session.attempts
            .map((attempt) => attempt.wordId)
            .filter(Boolean);
        const attemptedRetestIds = session.attempts
            .map((attempt) => attempt.retestItemId)
            .filter(Boolean);

        const retestItem = await SpellingRetestItem.findOne({
            school: schoolId,
            student: session.student,
            status: 'pending',
            sourceSession: { $ne: session._id },
            _id: { $nin: attemptedRetestIds }
        }).sort({ flaggedAt: 1, _id: 1 }).session(dbSession).lean();

        let item;
        if (retestItem) {
            item = {
                wordId: retestItem.sourceWord,
                retestItemId: retestItem._id,
                sequence: session.nextSequence,
                word: retestItem.wordSnapshot,
                grade: retestItem.grade,
                week: retestItem.week,
                category: retestItem.category,
                isRetest: true
            };
        } else if (session.curriculumGrade && session.curriculumWeek) {
            const wordQuery = {
                school: schoolId,
                grade: session.curriculumGrade,
                week: session.curriculumWeek,
                _id: { $nin: attemptedWordIds },
                order: { $gt: student.spelling?.lastWordIndex || 0 }
            };
            let word = await SpellingWord.findOne(wordQuery).sort({ order: 1 }).session(dbSession).lean();

            if (!word) {
                const nextWeekWord = await SpellingWord.findOne({
                    school: schoolId,
                    grade: session.curriculumGrade,
                    week: { $gt: session.curriculumWeek },
                    _id: { $nin: attemptedWordIds }
                }).sort({ week: 1, order: 1 }).session(dbSession).lean();

                if (nextWeekWord) {
                    session.curriculumWeek = nextWeekWord.week;
                    await Student.updateOne(
                        { _id: session.student, school: schoolId },
                        { $set: { 'spelling.currentWeek': nextWeekWord.week, 'spelling.lastWordIndex': 0 } },
                        { session: dbSession }
                    );
                    word = nextWeekWord;
                }
            }
            item = word ? {
                wordId: word._id,
                retestItemId: null,
                sequence: session.nextSequence,
                word: word.word,
                grade: word.grade,
                week: word.week,
                category: word.category,
                order: word.order,
                isRetest: false
            } : null;
        }

        if (!item) {
            session.status = 'completed';
            session.completedAt = new Date();
            session.completionReason = 'curriculum-exhausted';
            await session.save({ session: dbSession });
            return { session, item: null };
        }

        session.currentItem = {
            wordId: item.wordId,
            retestItemId: item.retestItemId,
            sequence: item.sequence
        };
        await session.save({ session: dbSession });
        return { session, item };
    });
}

export async function recordSpellingAttempt({ schoolId, sessionId, userId, sequence, correct, studentInput, idempotencyKey }) {
    if (!Number.isInteger(sequence) || sequence < 1) throw badRequest('sequence must be a positive integer');
    if (!idempotencyKey || typeof idempotencyKey !== 'string') throw badRequest('idempotencyKey is required');

    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');

        const duplicate = session.attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
        if (duplicate) return { session, attempt: duplicate, idempotent: true };
        if (session.status !== 'in-progress') throw conflict('Spelling session is no longer active');

        const item = await getCurrentItemData(session, dbSession);
        if (!item || item.sequence !== sequence) throw conflict('The requested spelling item is no longer current');

        const evaluatedCorrect = session.mode === 'self-serve'
            ? isCorrect(studentInput, item.word)
            : correct === true;
        const now = new Date();
        const attempt = {
            sequence,
            wordId: item.wordId,
            wordSnapshot: item.word,
            grade: item.grade,
            week: item.week,
            category: item.category,
            retestItemId: item.retestItemId,
            isRetest: item.isRetest,
            correct: evaluatedCorrect,
            studentInput: session.mode === 'self-serve' ? String(studentInput ?? '') : null,
            normalizedInput: session.mode === 'self-serve' ? normalizeForGrading(studentInput) : null,
            answeredAt: now,
            answeredBy: userId,
            idempotencyKey
        };

        session.attempts.push(attempt);
        const attemptDocument = session.attempts[session.attempts.length - 1];
        session.correctCount += evaluatedCorrect ? 1 : 0;
        session.mistakeCount += evaluatedCorrect ? 0 : 1;
        session.currentItem = { wordId: null, retestItemId: null, sequence: null };
        session.nextSequence += 1;

        if (item.isRetest && evaluatedCorrect) {
            await SpellingRetestItem.updateOne(
                { _id: item.retestItemId, school: schoolId, status: 'pending' },
                { $set: { status: 'resolved', resolvedAt: now, resolvedBySession: session._id } },
                { session: dbSession }
            );
        } else if (!item.isRetest && !evaluatedCorrect) {
            await SpellingRetestItem.updateOne(
                { school: schoolId, student: session.student, wordSnapshot: item.word, status: 'pending' },
                { $setOnInsert: {
                    school: schoolId,
                    student: session.student,
                    sourceWord: item.wordId,
                    wordSnapshot: item.word,
                    grade: item.grade,
                    week: item.week,
                    category: item.category,
                    sourceSession: session._id,
                    sourceAttempt: attemptDocument._id,
                    flaggedAt: now,
                    dueAt: session.retestDeadline,
                    status: 'pending'
                } },
                { upsert: true, session: dbSession }
            );
        }

        if (!item.isRetest) {
            await Student.updateOne(
                { _id: session.student, school: schoolId },
                { $set: { 'spelling.lastWordIndex': item.order || undefined } },
                { session: dbSession }
            );
        }

        if (session.mistakeCount >= session.maxMistakesAllowed) {
            session.status = 'completed';
            session.completedAt = now;
            session.completionReason = 'mistake-limit';
        }
        await session.save({ session: dbSession });
        if (session.status === 'completed') await queueSpellingCompletionEmail({ session, dbSession });
        return { session, attempt: attemptDocument, idempotent: false };
    });
}

export async function completeSpellingSession({ schoolId, sessionId, reason = 'manual-complete' }) {
    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');
        if (session.status === 'completed') return { session, idempotent: true };
        if (session.status === 'abandoned') throw conflict('Spelling session was abandoned');
        if (!['teacher-ended', 'manual-complete'].includes(reason)) throw badRequest('Invalid completion reason');

        session.status = 'completed';
        session.completedAt = new Date();
        session.completionReason = reason;
        session.currentItem = { wordId: null, retestItemId: null, sequence: null };
        await session.save({ session: dbSession });
        await queueSpellingCompletionEmail({ session, dbSession });
        return { session, idempotent: false };
    });
}

export async function abandonSpellingSession({ schoolId, sessionId }) {
    const session = await SpellingSession.findOneAndUpdate(
        { _id: sessionId, school: schoolId, status: 'in-progress' },
        { $set: { status: 'abandoned', completedAt: new Date(), completionReason: null } },
        { new: true }
    );
    if (!session) throw notFound('Active spelling session not found');
    return session;
}
