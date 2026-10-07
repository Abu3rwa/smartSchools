import Student from '../models/Student.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingClassSession from '../models/SpellingClassSession.js';
import { withTransaction } from '../utils/withTransaction.js';
import { evaluateSpellingAnswer, normalizeForGrading } from '../utils/spellingGrading.js';
import { queueSpellingCompletionEmail } from './spellingEmailService.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';
import SpellingClassSettings from '../models/SpellingClassSettings.js';
import { getNextSpellingGrade, getSpellingGradeProgress, SPELLING_CURRICULUM_GRADES } from '../utils/spellingProgress.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SPELLING_GRADE_MAX_WEEK = { KG: 40, G1: 36, G2: 36, G3: 36, G4: 36, G5: 36 };

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

const saveSpellingGradeProgress = async ({ schoolId, session, week, lastWordIndex, dbSession }) => {
    const studentFilter = { _id: session.student, school: schoolId };
    const student = await Student.findOne(studentFilter).select('spelling').session(dbSession).lean();
    const currentProgress = getSpellingGradeProgress(student, session.curriculumGrade);
    if (currentProgress.week && (
        currentProgress.week > week
        || (currentProgress.week === week && currentProgress.lastWordIndex >= lastWordIndex)
    )) return;

    const gradeProgressFilter = { ...studentFilter, 'spelling.progressByGrade.grade': session.curriculumGrade };
    const gradeProgressUpdate = {
        $set: {
            'spelling.progressByGrade.$.week': week,
            'spelling.progressByGrade.$.lastWordIndex': lastWordIndex
        }
    };
    const updateOptions = dbSession ? { session: dbSession } : {};

    const updated = await Student.updateOne(gradeProgressFilter, gradeProgressUpdate, updateOptions);
    if (updated.matchedCount === 0) {
        await Student.updateOne(
            studentFilter,
            {
                $push: {
                    'spelling.progressByGrade': {
                        grade: session.curriculumGrade,
                        week,
                        lastWordIndex
                    }
                }
            },
            updateOptions
        );
    }

    const legacyUpdate = { ...studentFilter, 'spelling.currentGrade': session.curriculumGrade };
    await Student.updateOne(
        legacyUpdate,
        { $set: { 'spelling.currentWeek': week, 'spelling.lastWordIndex': lastWordIndex } },
        updateOptions
    );
};

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
            const sourceWord = retestItem.sourceWord
                ? await SpellingWord.findOne({ _id: retestItem.sourceWord, school: session.school }).session(dbSession).lean()
                : null;
            return {
                wordId: retestItem.sourceWord,
                retestItemId: retestItem._id,
                sequence: session.currentItem.sequence,
                word: retestItem.wordSnapshot,
                definition: sourceWord?.definition || '',
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
                definition: word.definition || '',
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

const hasCorrectClassWordAttempt = async ({ schoolId, studentId, wordId, dbSession }) => {
    let query = SpellingSession.findOne({
        school: schoolId,
        student: studentId,
        attempts: { $elemMatch: { wordId, correct: true, isRetest: false } }
    }).select('_id');
    if (dbSession) query = query.session(dbSession);
    return Boolean(await query.lean());
};

const advanceClassSession = async ({ group, schoolId, dbSession }) => {
    const word = await SpellingWord.findOne({ _id: group.currentWord, school: schoolId })
        .session(dbSession)
        .lean();
    if (!word) throw notFound('The current class spelling word was not found');

    const nextWord = await SpellingWord.findOne({
        school: schoolId,
        grade: group.grade,
        $or: [
            { week: { $gt: word.week } },
            { week: word.week, order: { $gt: word.order } }
        ]
    }).sort({ week: 1, order: 1 }).session(dbSession).lean();

    if (!nextWord) {
        group.status = 'completed';
        await group.save({ session: dbSession });
        const sessionIds = group.participants.map((participant) => participant.session).filter(Boolean);
        const sessions = await SpellingSession.find({
            _id: { $in: sessionIds },
            school: schoolId,
            status: 'in-progress'
        }).session(dbSession);
        for (const session of sessions) {
            session.status = 'completed';
            session.completedAt = new Date();
            session.completionReason = 'curriculum-exhausted';
            session.currentItem = { wordId: null, retestItemId: null, sequence: null };
            await session.save({ session: dbSession });
            await queueSpellingCompletionEmail({ session, dbSession });
        }
        return;
    }

    group.currentWord = nextWord._id;
    for (const participant of group.participants) {
        participant.submittedWord = await hasCorrectClassWordAttempt({
            schoolId,
            studentId: participant.student,
            wordId: nextWord._id,
            dbSession
        }) ? nextWord._id : null;
        participant.correct = Boolean(participant.submittedWord);
    }
    await group.save({ session: dbSession });
    await SpellingSession.updateMany(
        { _id: { $in: group.participants.map((participant) => participant.session).filter(Boolean) }, school: schoolId, status: 'in-progress' },
        { $set: { curriculumWeek: nextWord.week, currentItem: { wordId: null, retestItemId: null, sequence: null } } },
        { session: dbSession }
    );
};

const getSharedClassItem = async ({ session, dbSession }) => {
    const group = await SpellingClassSession.findOne({
        _id: session.classSession,
        school: session.school,
        status: 'in-progress'
    }).session(dbSession);
    if (!group) {
        if (session.status === 'in-progress') {
            session.status = 'completed';
            session.completedAt = new Date();
            session.completionReason = 'curriculum-exhausted';
            session.currentItem = { wordId: null, retestItemId: null, sequence: null };
            await session.save({ session: dbSession });
        }
        return null;
    }

    let participant = group.participants.find((entry) => String(entry.student) === String(session.student));
    if (!participant) throw conflict('This student is not part of the active class spelling session');

    for (let check = 0; check < 10000; check += 1) {
        const word = await SpellingWord.findOne({ _id: group.currentWord, school: session.school })
            .session(dbSession)
            .lean();
        if (!word) throw notFound('The current class spelling word was not found');

        const alreadySubmitted = String(participant.submittedWord || '') === String(word._id);
        if (!alreadySubmitted && await hasCorrectClassWordAttempt({
            schoolId: session.school,
            studentId: session.student,
            wordId: word._id,
            dbSession
        })) {
            participant.submittedWord = word._id;
            participant.correct = true;
            await group.save({ session: dbSession });
        }

        const allSubmitted = group.participants.length > 0 && group.participants.every(
            (entry) => String(entry.submittedWord || '') === String(word._id)
        );
        if (allSubmitted) {
            await advanceClassSession({ group, schoolId: session.school, dbSession });
            if (group.status !== 'in-progress') {
                session.status = 'completed';
                session.completedAt = new Date();
                session.completionReason = 'curriculum-exhausted';
                session.currentItem = { wordId: null, retestItemId: null, sequence: null };
                return null;
            }
            participant = group.participants.find((entry) => String(entry.student) === String(session.student));
            continue;
        }

        const sequence = alreadySubmitted || String(participant.submittedWord || '') === String(word._id)
            ? (session.currentItem?.sequence || session.nextSequence)
            : session.nextSequence;
        session.curriculumWeek = word.week;
        session.currentItem = { wordId: word._id, retestItemId: null, sequence };
        await session.save({ session: dbSession });
        return {
            wordId: word._id,
            retestItemId: null,
            sequence,
            word: word.word,
            definition: word.definition || '',
            grade: word.grade,
            week: word.week,
            category: word.category,
            order: word.order,
            isRetest: false,
            alreadyCompleted: Boolean(participant.correct && String(participant.submittedWord || '') === String(word._id)),
            waitingForClass: Boolean(!participant.correct && participant.submittedWord && String(participant.submittedWord) === String(word._id))
        };
    }
    throw conflict('The class spelling session could not advance past completed words');
};

export async function startSpellingSession({ schoolId, studentId, userId, mode, maxMistakesAllowed, retestDeadline, curriculumGrade, curriculumWeek, classSessionId = null, emailNotification = null, passageEmailAudience = null, passageGeneration = {} }) {
    if (!['teacher-led', 'self-serve'].includes(mode)) throw badRequest('Invalid spelling session mode');
    if (maxMistakesAllowed !== undefined && maxMistakesAllowed !== null && (!Number.isInteger(maxMistakesAllowed) || maxMistakesAllowed < 1 || maxMistakesAllowed > 50)) {
        throw badRequest('maxMistakesAllowed must be a positive integer between 1 and 50');
    }
    if (emailNotification !== null && emailNotification !== undefined && !isSpellingEmailAudience(emailNotification)) {
        throw badRequest('Invalid spelling email audience');
    }
    if (passageEmailAudience !== null && passageEmailAudience !== undefined && !isSpellingEmailAudience(passageEmailAudience)) {
        throw badRequest('Invalid passage email audience');
    }

    const startedAt = new Date();
    const deadline = retestDeadline ? new Date(retestDeadline) : new Date(startedAt.getTime() + (7 * DAY_MS));
    if (Number.isNaN(deadline.getTime()) || deadline < startedAt) throw badRequest('retestDeadline must be a valid future date');

    const student = await Student.findOne({ _id: studentId, school: schoolId }).lean();
    if (!student) throw notFound('Student not found');

    let selectedGrade = curriculumGrade || student.spelling?.currentGrade;
    if (!selectedGrade || !SPELLING_CURRICULUM_GRADES.includes(selectedGrade)) {
        throw badRequest('Select a valid spelling grade before starting an assessment');
    }

    const activeSession = await SpellingSession.findOne({
        school: schoolId,
        student: studentId,
        status: 'in-progress'
    }).sort({ startedAt: -1 });
    if (activeSession) {
        if (activeSession.mode === mode && activeSession.curriculumGrade === selectedGrade) {
            const current = await getCurrentSpellingItem({ schoolId, sessionId: activeSession._id });
            return current.session;
        }
        throw conflict('This student already has an active spelling session. End it before starting a different grade or session.');
    }

    let gradeProgress = getSpellingGradeProgress(student, selectedGrade);
    if (!classSessionId && student.spelling?.currentGrade === selectedGrade) {
        const lastGradeWord = await SpellingWord.findOne({ school: schoolId, grade: selectedGrade })
            .sort({ week: -1, order: -1 })
            .select('week order')
            .lean();
        const gradeIsComplete = lastGradeWord
            && Number(gradeProgress.week) === lastGradeWord.week
            && gradeProgress.lastWordIndex >= lastGradeWord.order;

        if (gradeIsComplete) {
            const nextGrade = getNextSpellingGrade(selectedGrade);
            if (!nextGrade) {
                throw badRequest(`The student has completed all available spelling grades (${selectedGrade})`);
            }

            const nextGradeWeekOne = await SpellingWord.findOne({
                school: schoolId,
                grade: nextGrade,
                week: 1
            }).sort({ order: 1 }).select('week').lean();
            if (!nextGradeWeekOne) {
                throw badRequest(`No spelling words are available for ${nextGrade} week 1`);
            }

            const nextGradeProgress = getSpellingGradeProgress(student, nextGrade);
            const nextWeek = nextGradeProgress.week || nextGradeWeekOne.week;
            const nextWordIndex = nextGradeProgress.week ? nextGradeProgress.lastWordIndex : 0;
            const promotedStudent = await Student.findOneAndUpdate(
                { _id: studentId, school: schoolId, 'spelling.currentGrade': selectedGrade },
                {
                    $set: {
                        'spelling.currentGrade': nextGrade,
                        'spelling.currentWeek': nextWeek,
                        'spelling.lastWordIndex': nextWordIndex
                    }
                },
                { new: true }
            ).lean();

            if (promotedStudent) {
                student.spelling = promotedStudent.spelling;
            } else {
                const latestStudent = await Student.findOne({ _id: studentId, school: schoolId }).lean();
                if (!latestStudent) throw notFound('Student not found');
                if (latestStudent.spelling?.currentGrade !== nextGrade) {
                    throw conflict('The student grade changed while starting the spelling session. Refresh and try again.');
                }
                student.spelling = latestStudent.spelling;
            }
            selectedGrade = nextGrade;
            gradeProgress = getSpellingGradeProgress(student, selectedGrade);
        }
    }

    if (!classSessionId && gradeProgress.week > SPELLING_GRADE_MAX_WEEK[selectedGrade]) {
        const update = {
            $pull: { 'spelling.progressByGrade': { grade: selectedGrade } }
        };
        if (student.spelling?.currentGrade === selectedGrade) {
            update.$set = {
                'spelling.currentWeek': null,
                'spelling.lastWordIndex': 0
            };
        }
        await Student.updateOne({ _id: studentId, school: schoolId }, update);
        student.spelling = {
            ...student.spelling,
            currentWeek: student.spelling?.currentGrade === selectedGrade ? null : student.spelling?.currentWeek,
            lastWordIndex: student.spelling?.currentGrade === selectedGrade ? 0 : student.spelling?.lastWordIndex,
            progressByGrade: (student.spelling?.progressByGrade || []).filter((entry) => entry.grade !== selectedGrade)
        };
        gradeProgress = { week: null, lastWordIndex: 0 };
    }

    let selectedWeek = classSessionId ? undefined : (curriculumWeek || gradeProgress.week);
    if (!selectedWeek) {
        const firstWord = await SpellingWord.findOne({ school: schoolId, grade: selectedGrade })
            .sort({ week: 1, order: 1 })
            .select('week')
            .lean();
        selectedWeek = firstWord?.week;
    }
    if (!Number.isInteger(Number(selectedWeek)) || Number(selectedWeek) < 1) {
        throw badRequest('Select a valid spelling week before starting an assessment');
    }
    selectedWeek = Number(selectedWeek);
    if (!classSessionId && selectedWeek > SPELLING_GRADE_MAX_WEEK[selectedGrade]) {
        throw badRequest(`${selectedGrade} spelling weeks cannot exceed ${SPELLING_GRADE_MAX_WEEK[selectedGrade]}`);
    }
    const wordCount = await SpellingWord.countDocuments({
        school: schoolId,
        grade: selectedGrade,
        week: { $gte: selectedWeek }
    });
    if (wordCount === 0) {
        throw badRequest(`No spelling words remain for ${selectedGrade} from week ${selectedWeek}`);
    }
    const targetClassId = student.currentClass || (student.enrolledClasses && student.enrolledClasses[0]);
    const classSettings = targetClassId
        ? await SpellingClassSettings.findOne({ school: schoolId, class: targetClassId }).lean()
        : null;

    // Resolve defaults from class settings if not explicitly specified by teacher
    const effectiveEmailNotification = emailNotification !== undefined && emailNotification !== null
        ? emailNotification
        : (classSettings?.defaultEmailAudience || DEFAULT_SPELLING_EMAIL_AUDIENCE);

    const effectivePassageEmailAudience = passageEmailAudience !== undefined && passageEmailAudience !== null
        ? passageEmailAudience
        : (classSettings?.passageGeneration?.passageEmailAudience || 'none');

    const effectiveMaxMistakesAllowed = Number.isInteger(maxMistakesAllowed) && maxMistakesAllowed >= 1
        ? maxMistakesAllowed
        : (classSettings?.defaultMaxMistakes || 3);

    const dictationMode = {
        enabled: classSettings?.dictationMode?.enabled === true,
        autoPlayOnShow: classSettings?.dictationMode?.autoPlayOnShow !== false
    };

    const session = await SpellingSession.create({
        school: schoolId,
        student: studentId,
        mode,
        maxMistakesAllowed: effectiveMaxMistakesAllowed,
        retestDeadline: deadline,
        curriculumGrade: selectedGrade,
        curriculumWeek: selectedWeek,
        classSession: classSessionId,
        emailNotification: effectiveEmailNotification,
        passageEmailAudience: effectivePassageEmailAudience,
        passageGeneration: {
            enabled: passageGeneration.enabled === true,
            trigger: 'manual',
            style: passageGeneration.style === 'passage' ? 'passage' : 'sentence-list',
            requireTeacherApproval: true
        },
        dictationMode,
        startedAt,
        createdBy: userId,
        administeredBy: mode === 'teacher-led' ? userId : null
    });

    const current = await getCurrentSpellingItem({ schoolId, sessionId: session._id });
    return current.session;
}

export async function startSpellingClassSession({
    schoolId,
    classId,
    studentIds,
    userId,
    mode,
    maxMistakesAllowed,
    curriculumGrade,
    retestDeadline,
    emailNotification,
    passageEmailAudience,
    passageGeneration
}) {
    if (!['teacher-led', 'self-serve'].includes(mode)) throw badRequest('Invalid spelling session mode');
    if (!SPELLING_CURRICULUM_GRADES.includes(curriculumGrade)) {
        throw badRequest('Select a valid spelling grade before starting a class assessment');
    }
    if (maxMistakesAllowed !== undefined && maxMistakesAllowed !== null && (!Number.isInteger(maxMistakesAllowed) || maxMistakesAllowed < 1 || maxMistakesAllowed > 50)) {
        throw badRequest('maxMistakesAllowed must be a positive integer between 1 and 50');
    }
    if (emailNotification !== undefined && emailNotification !== null && !isSpellingEmailAudience(emailNotification)) {
        throw badRequest('Invalid spelling email audience');
    }
    if (passageEmailAudience !== undefined && passageEmailAudience !== null && !isSpellingEmailAudience(passageEmailAudience)) {
        throw badRequest('Invalid passage email audience');
    }
    const start = new Date();
    const deadline = retestDeadline ? new Date(retestDeadline) : new Date(start.getTime() + (7 * DAY_MS));
    if (Number.isNaN(deadline.getTime()) || deadline < start) throw badRequest('retestDeadline must be a valid future date');
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw badRequest('The selected class has no students');
    }

    let group = await SpellingClassSession.findOne({ school: schoolId, class: classId, grade: curriculumGrade });
    if (group?.status === 'completed') {
        throw conflict(`The class has completed all ${curriculumGrade} spelling words`);
    }

    // Students busy in another class's (or an individual) session are left out; this class's own sessions resume.
    const activeSessions = await SpellingSession.find({
        school: schoolId,
        student: { $in: studentIds },
        status: 'in-progress'
    }).select('student classSession').lean();
    const busyStudentIds = new Set(activeSessions
        .filter((active) => !group || String(active.classSession || '') !== String(group._id))
        .map((active) => String(active.student)));
    studentIds = studentIds.filter((id) => !busyStudentIds.has(String(id)));
    if (studentIds.length === 0) {
        throw conflict('All students in this class are in another active spelling session. End those sessions first.');
    }
    if (!group) {
        const firstWord = await SpellingWord.findOne({ school: schoolId, grade: curriculumGrade })
            .sort({ week: 1, order: 1 })
            .select('_id')
            .lean();
        if (!firstWord) throw badRequest(`No spelling words are available for ${curriculumGrade}`);
        group = await SpellingClassSession.create({
            school: schoolId,
            class: classId,
            grade: curriculumGrade,
            currentWord: firstWord._id
        });
    }

    group.participants = await Promise.all(studentIds.map(async (studentId) => {
        const alreadyCorrect = await hasCorrectClassWordAttempt({
            schoolId,
            studentId,
            wordId: group.currentWord
        });
        return {
            student: studentId,
            session: null,
            submittedWord: alreadyCorrect ? group.currentWord : null,
            correct: alreadyCorrect
        };
    }));
    await group.save();

    const sessions = [];
    for (const studentId of studentIds) {
        const session = await startSpellingSession({
            schoolId,
            studentId,
            userId,
            mode,
            maxMistakesAllowed,
            retestDeadline,
            curriculumGrade,
            curriculumWeek: undefined,
            classSessionId: group._id,
            emailNotification,
            passageEmailAudience,
            passageGeneration
        });
        sessions.push(session);
        const participant = group.participants.find((entry) => String(entry.student) === String(studentId));
        participant.session = session._id;
        await group.save();
    }

    const firstItem = await getCurrentSpellingItem({ schoolId, sessionId: sessions[0]._id });
    return { classSession: firstItem.session.classSession, sessions };
}

// Lets the teacher move the whole class to the next word without waiting for absent students.
export async function advanceClassWord({ schoolId, sessionId, expectedWordId }) {
    await withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');
        if (!session.classSession) throw badRequest('This session is not part of a class session');
        if (session.mode !== 'teacher-led') throw badRequest('Only teacher-led class sessions can be advanced manually');
        if (session.status !== 'in-progress') throw conflict('Spelling session is no longer active');

        const group = await SpellingClassSession.findOne({
            _id: session.classSession,
            school: schoolId,
            status: 'in-progress'
        }).session(dbSession);
        if (!group) throw conflict('The class spelling session is no longer active');
        // Already advanced by another request; nothing to do.
        if (expectedWordId && String(group.currentWord) !== String(expectedWordId)) return;
        await advanceClassSession({ group, schoolId, dbSession });
    });
    return getCurrentSpellingItem({ schoolId, sessionId });
}

export async function getCurrentSpellingItem({ schoolId, sessionId }) {
    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');
        if (session.status !== 'in-progress') return { session, item: null };

        if (session.classSession) {
            const item = await getSharedClassItem({ session, dbSession });
            return { session, item };
        }

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
            const sourceWord = retestItem.sourceWord
                ? await SpellingWord.findOne({ _id: retestItem.sourceWord, school: schoolId }).session(dbSession).lean()
                : null;
            item = {
                wordId: retestItem.sourceWord,
                retestItemId: retestItem._id,
                sequence: session.nextSequence,
                word: retestItem.wordSnapshot,
                definition: sourceWord?.definition || '',
                grade: retestItem.grade,
                week: retestItem.week,
                category: retestItem.category,
                isRetest: true
            };
        } else if (session.curriculumGrade && session.curriculumWeek) {
            const gradeProgress = getSpellingGradeProgress(student, session.curriculumGrade);
            const wordQuery = {
                school: schoolId,
                grade: session.curriculumGrade,
                week: session.curriculumWeek,
                _id: { $nin: attemptedWordIds },
                order: {
                    $gt: gradeProgress.week === session.curriculumWeek
                        ? gradeProgress.lastWordIndex
                        : 0
                }
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
                    await saveSpellingGradeProgress({
                        schoolId,
                        session,
                        week: nextWeekWord.week,
                        lastWordIndex: 0,
                        dbSession
                    });
                    word = nextWeekWord;
                }
            }
            item = word ? {
                wordId: word._id,
                retestItemId: null,
                sequence: session.nextSequence,
                word: word.word,
                definition: word.definition || '',
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

export async function recordSpellingAttempt({ schoolId, sessionId, userId, sequence, correct, studentInput, skipped = false, idempotencyKey }) {
    if (!Number.isInteger(sequence) || sequence < 1) throw badRequest('sequence must be a positive integer');
    if (!idempotencyKey || typeof idempotencyKey !== 'string') throw badRequest('idempotencyKey is required');

    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');

        const duplicate = session.attempts.find((attempt) => attempt.idempotencyKey === idempotencyKey);
        if (duplicate) return { session, attempt: duplicate, idempotent: true };
        if (session.status !== 'in-progress') throw conflict('Spelling session is no longer active');

        const item = session.classSession
            ? await getSharedClassItem({ session, dbSession })
            : await getCurrentItemData(session, dbSession);
        if (!item || item.sequence !== sequence) throw conflict('The requested spelling item is no longer current');
        if (item.alreadyCompleted || item.waitingForClass) {
            throw conflict('This student has already submitted the current class word');
        }

        const outcome = evaluateSpellingAnswer({
            mode: session.mode,
            studentInput,
            correct,
            skipped,
            canonicalWord: item.word
        });
        const evaluatedCorrect = outcome.correct;
        const isSkipped = outcome.skipped;
        const now = new Date();
        const attempt = {
            sequence,
            wordId: item.wordId,
            wordSnapshot: item.word,
            grade: item.grade,
            week: item.week,
            category: item.category,
            order: item.order || null,
            retestItemId: item.retestItemId,
            isRetest: item.isRetest,
            correct: evaluatedCorrect,
            skipped: isSkipped,
            studentInput: session.mode === 'self-serve' ? String(studentInput ?? '') : null,
            normalizedInput: session.mode === 'self-serve' ? normalizeForGrading(studentInput) : null,
            answeredAt: now,
            answeredBy: userId,
            idempotencyKey
        };

        session.attempts.push(attempt);
        const attemptDocument = session.attempts[session.attempts.length - 1];
        session.correctCount += evaluatedCorrect ? 1 : 0;
        session.mistakeCount += outcome.countsAsMistake ? 1 : 0;
        session.currentItem = { wordId: null, retestItemId: null, sequence: null };
        session.nextSequence += 1;

        if (session.classSession) {
            const group = await SpellingClassSession.findOne({
                _id: session.classSession,
                school: schoolId,
                status: 'in-progress'
            }).session(dbSession);
            if (!group) throw conflict('The class spelling session is no longer active');
            const participant = group.participants.find((entry) => String(entry.student) === String(session.student));
            if (!participant) throw conflict('This student is not part of the active class spelling session');
            participant.submittedWord = item.wordId;
            participant.correct = evaluatedCorrect;

            if (!item.isRetest) {
                await saveSpellingGradeProgress({
                    schoolId,
                    session,
                    week: item.week,
                    lastWordIndex: item.order || 0,
                    dbSession
                });
            }
            if (!item.isRetest && outcome.countsAsMistake) {
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

            await session.save({ session: dbSession });
            await group.save({ session: dbSession });
            const allSubmitted = group.participants.length > 0 && group.participants.every(
                (entry) => String(entry.submittedWord || '') === String(item.wordId)
            );
            if (allSubmitted) await advanceClassSession({ group, schoolId, dbSession });
            return { session, attempt: attemptDocument, idempotent: false };
        }

        if (item.isRetest && evaluatedCorrect) {
            await SpellingRetestItem.updateOne(
                { _id: item.retestItemId, school: schoolId, status: 'pending' },
                { $set: { status: 'resolved', resolvedAt: now, resolvedBySession: session._id } },
                { session: dbSession }
            );
        } else if (!item.isRetest && outcome.countsAsMistake) {
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
            await saveSpellingGradeProgress({
                schoolId,
                session,
                week: item.week,
                lastWordIndex: item.order || 0,
                dbSession
            });
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

export async function markSpellingAttemptCorrect({ schoolId, sessionId, attemptId, userId }) {
    if (!attemptId) throw badRequest('A spelling attempt is required');

    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');
        if (session.status === 'abandoned') throw conflict('An abandoned spelling session cannot be corrected');

        const attempt = session.attempts.find((entry) => String(entry._id) === String(attemptId));
        if (!attempt) throw notFound('Spelling attempt not found');
        if (attempt.skipped) throw badRequest('A skipped spelling attempt cannot be marked correct');
        if (attempt.correct) return { session, attempt, idempotent: true };

        const correctedAt = new Date();
        attempt.correct = true;
        attempt.correctedAt = correctedAt;
        attempt.correctedBy = userId;
        session.correctCount += 1;
        session.mistakeCount = Math.max(0, session.mistakeCount - 1);

        if (!attempt.isRetest) {
            await saveSpellingGradeProgress({
                schoolId,
                session,
                week: attempt.week,
                lastWordIndex: attempt.order || 0,
                dbSession
            });
        }

        await SpellingRetestItem.updateMany(
            {
                school: schoolId,
                student: session.student,
                sourceWord: attempt.wordId,
                status: 'pending'
            },
            {
                $set: {
                    status: 'resolved',
                    resolvedAt: correctedAt,
                    resolvedBySession: session._id
                }
            },
            { session: dbSession }
        );

        if (session.classSession) {
            const group = await SpellingClassSession.findOne({
                _id: session.classSession,
                school: schoolId
            }).session(dbSession);
            const participant = group?.participants.find(
                (entry) => String(entry.student) === String(session.student)
            );
            if (participant && String(participant.submittedWord || '') === String(attempt.wordId)) {
                participant.correct = true;
                await group.save({ session: dbSession });
            }
        }

        await session.save({ session: dbSession });
        return { session, attempt, idempotent: false };
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
