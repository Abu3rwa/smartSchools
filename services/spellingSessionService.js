import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Grade from '../models/Grade.js';
import SpellingWord from '../models/SpellingWord.js';
import SpellingRetestItem from '../models/SpellingRetestItem.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingEmailDelivery from '../models/SpellingEmailDelivery.js';
import { withTransaction } from '../utils/withTransaction.js';
import { evaluateSpellingAnswer, normalizeForGrading } from '../utils/spellingGrading.js';
import {
    buildFormalTestWordList,
    processSpellingEmailDelivery,
    queueFormalSpellingTestWordListEmail,
    queueSpellingCompletionEmail
} from './spellingEmailService.js';
import gmailOAuthService from './gmailOAuthService.js';
import { DEFAULT_SPELLING_EMAIL_AUDIENCE, isSpellingEmailAudience } from '../utils/spellingEmailSettings.js';
import SpellingClassSettings from '../models/SpellingClassSettings.js';
import { getNextSpellingGrade, getSpellingGradeProgress, SPELLING_CURRICULUM_GRADES } from '../utils/spellingProgress.js';
import { resolveSemesterForDate } from './gradebookConfigService.js';
import logger from '../utils/logger.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SPELLING_GRADE_MAX_WEEK = { KG: 40, G1: 36, G2: 36, G3: 36, G4: 36, G5: 36 };

const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const conflict = (message) => Object.assign(new Error(message), { statusCode: 409 });

const recordRetestOutcome = async ({ schoolId, studentId, retestItemId, correct, skipped, sessionId, formalTest = false, at, dbSession }) => {
    if (!retestItemId || skipped) return;
    const retestItem = await SpellingRetestItem.findOne({
        _id: retestItemId,
        school: schoolId,
        student: studentId,
        status: { $in: ['pending', 'practice-mastered'] }
    }).session(dbSession);
    if (!retestItem) return;

    if (formalTest && correct) {
        await SpellingRetestItem.updateMany(
            {
                school: schoolId,
                student: studentId,
                sourceWord: retestItem.sourceWord,
                status: { $in: ['pending', 'practice-mastered'] }
            },
            {
                $set: { status: 'resolved', resolvedAt: at, resolvedBySession: sessionId },
                $unset: { practiceMasteredAt: 1, practiceMasteredBySession: 1 }
            },
            { session: dbSession }
        );
        return;
    }

    if (formalTest) {
        retestItem.status = 'pending';
        retestItem.practiceMasteredAt = null;
        retestItem.practiceMasteredBySession = null;
        retestItem.correctRetestStreak = 0;
        retestItem.incorrectRetestCount = (Number(retestItem.incorrectRetestCount) || 0) + 1;
        await retestItem.save({ session: dbSession });
        return;
    }

    if (correct) {
        retestItem.correctRetestStreak = (Number(retestItem.correctRetestStreak) || 0) + 1;
        if (retestItem.correctRetestStreak >= 3) {
            retestItem.status = 'practice-mastered';
            retestItem.practiceMasteredAt = at;
            retestItem.practiceMasteredBySession = sessionId;
        }
    } else {
        retestItem.correctRetestStreak = 0;
        retestItem.incorrectRetestCount = (Number(retestItem.incorrectRetestCount) || 0) + 1;
    }
    await retestItem.save({ session: dbSession });
};

export const migratePracticeResolvedRetests = async ({ schoolId, studentId }) => {
    const resolvedItems = await SpellingRetestItem.find({
        school: schoolId,
        student: studentId,
        status: 'resolved'
    }).select('_id resolvedAt resolvedBySession').lean();
    if (!resolvedItems.length) return 0;

    const resolvedSessionIds = [...new Set(resolvedItems
        .map((item) => item.resolvedBySession && String(item.resolvedBySession))
        .filter(Boolean))];
    const resolvingSessions = resolvedSessionIds.length
        ? await SpellingSession.find({
            _id: { $in: resolvedSessionIds },
            school: schoolId
        }).select('_id assessmentType').lean()
        : [];
    const formalSessionIds = new Set(resolvingSessions
        .filter((session) => session.assessmentType === 'formal-spelling-test')
        .map((session) => String(session._id)));
    const itemsToRestore = resolvedItems.filter((item) => (
        !item.resolvedBySession || !formalSessionIds.has(String(item.resolvedBySession))
    ));
    if (!itemsToRestore.length) return 0;

    let migratedCount = 0;
    for (const item of itemsToRestore) {
        const result = await SpellingRetestItem.updateOne(
            { _id: item._id, school: schoolId, student: studentId, status: 'resolved' },
            {
                $set: {
                    status: 'practice-mastered',
                    practiceMasteredAt: item.resolvedAt || new Date(),
                    practiceMasteredBySession: item.resolvedBySession || null
                },
                $unset: { resolvedAt: 1, resolvedBySession: 1 }
            }
        );
        migratedCount += result.modifiedCount;
    }
    return migratedCount;
};

const resolveFormalTestWordList = async ({ schoolId, studentId }) => {
    // Misses that were only cleared by practice rejoin the pool, so any count of
    // this word list must run the same normalization the scheduling guard runs.
    await migratePracticeResolvedRetests({ schoolId, studentId });
    const unresolvedRetests = await SpellingRetestItem.find({
        school: schoolId,
        student: studentId,
        status: { $in: ['pending', 'practice-mastered'] }
    }).sort({ flaggedAt: 1, _id: 1 }).lean();
    return buildFormalTestWordList({ retestItems: unresolvedRetests });
};

export const getFormalTestPrepReadiness = async ({ schoolId, studentId }) => {
    const wordList = await resolveFormalTestWordList({ schoolId, studentId });
    return { wordCount: wordList.plannedWords.length };
};

const saveFormalSpellingGradebookEntry = async ({ schoolId, session, dbSession }) => {
    if (session.assessmentType !== 'formal-spelling-test' || !session.attempts.length) return;
    if (!session.gradebookSubject || !session.gradebookClass || !session.gradebookAcademicYear
        || !(session.createdBy || session.administeredBy)) {
        throw conflict('The formal spelling test is missing its Gradebook subject or class details');
    }

    const date = session.completedAt || new Date();
    const month = date.getMonth() + 1;
    const semester = await resolveSemesterForDate(schoolId, date);
    await Grade.findOneAndUpdate(
        { school: schoolId, spellingSession: session._id },
        {
            $set: {
                subject: session.gradebookSubject,
                class: session.gradebookClass,
                teacher: session.createdBy || session.administeredBy,
                academicYear: session.gradebookAcademicYear,
                gradeType: 'quiz',
                category: 'quiz',
                date,
                marks: Math.min(session.correctCount, session.attempts.length),
                maxMarks: session.attempts.length,
                month,
                semester: semester || (month >= 8 && month <= 12 ? 1 : 2),
                title: `Formal spelling assessment - ${session.curriculumGrade} - Week ${session.curriculumWeek}`,
                description: `Spelling assessment score: ${Math.min(session.correctCount, session.attempts.length)} of ${session.attempts.length} words.`,
                notes: '',
                remarks: '',
                assessmentGroupId: `spelling-${session._id}`,
                gradingSource: 'spelling_assessment'
            },
            $setOnInsert: {
                school: schoolId,
                student: session.student,
                spellingSession: session._id
            }
        },
        { upsert: true, new: true, runValidators: true, session: dbSession }
    );
};

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
    const plannedWordIndex = session.currentItem?.plannedWordIndex;

    if (
        !currentSequence ||
        attemptedSequences.has(currentSequence) ||
        (Number.isInteger(plannedWordIndex) && session.attempts.some((attempt) => attempt.plannedWordIndex === plannedWordIndex)) ||
        (currentWordId && attemptedWordIds.has(currentWordId)) ||
        (currentRetestId && attemptedRetestIds.has(currentRetestId))
    ) {
        return null;
    }

    if (Number.isInteger(plannedWordIndex) && session.formalTestWordList?.[plannedWordIndex]) {
        const plannedWord = session.formalTestWordList[plannedWordIndex];
        const sourceWord = await SpellingWord.findOne({
            _id: plannedWord.wordId,
            school: session.school
        }).session(dbSession).select('definition').lean();
        return {
            wordId: plannedWord.wordId,
            retestItemId: plannedWord.retestItemId,
            plannedWordIndex,
            sequence: currentSequence,
            word: plannedWord.wordSnapshot,
            definition: sourceWord?.definition || '',
            grade: plannedWord.grade,
            week: plannedWord.week,
            category: plannedWord.category,
            order: plannedWord.order,
            isRetest: plannedWord.isRetest
        };
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

export async function startSpellingSession({ schoolId, studentId, userId, mode, maxMistakesAllowed, retestDeadline, scheduledAt, formalAssessment = false, formalTestWordListEmail = false, formalTestWordListEmailAudience = null, formalTestWordListEmailTimezone = 'UTC', curriculumGrade, curriculumWeek, emailNotification = null, passageEmailAudience = null, passageGeneration = {} }) {
    const requestedMode = mode ?? 'self-serve';
    if (formalAssessment && requestedMode !== 'self-serve') {
        throw badRequest('Formal spelling assessments must be self-serve');
    }
    if (requestedMode === 'teacher-led') {
        throw badRequest('Teacher-led spelling sessions are no longer available. Use a self-serve assessment instead.');
    }
    if (requestedMode !== 'self-serve') throw badRequest('Invalid spelling session mode');
    if (typeof formalTestWordListEmail !== 'boolean') throw badRequest('formalTestWordListEmail must be a boolean');
    if (formalTestWordListEmail && (!formalAssessment || scheduledAt === undefined || scheduledAt === null)) {
        throw badRequest('Formal test word-list emails are only available for scheduled formal assessments');
    }
    if (formalTestWordListEmailAudience !== null && formalTestWordListEmailAudience !== undefined
        && !isSpellingEmailAudience(formalTestWordListEmailAudience)) {
        throw badRequest('Invalid formal test email audience');
    }
    if (typeof formalTestWordListEmailTimezone !== 'string' || !formalTestWordListEmailTimezone.trim()) {
        throw badRequest('formalTestWordListEmailTimezone must be a valid time zone');
    }
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: formalTestWordListEmailTimezone });
    } catch (error) {
        if (error instanceof RangeError) throw badRequest('formalTestWordListEmailTimezone must be a valid time zone');
        throw error;
    }
    if (maxMistakesAllowed !== undefined && maxMistakesAllowed !== null && (!Number.isInteger(maxMistakesAllowed) || maxMistakesAllowed < 1 || maxMistakesAllowed > 50)) {
        throw badRequest('maxMistakesAllowed must be a positive integer between 1 and 50');
    }
    if (emailNotification !== null && emailNotification !== undefined && !isSpellingEmailAudience(emailNotification)) {
        throw badRequest('Invalid spelling email audience');
    }
    if (passageEmailAudience !== null && passageEmailAudience !== undefined && !isSpellingEmailAudience(passageEmailAudience)) {
        throw badRequest('Invalid passage email audience');
    }

    const now = new Date();
    const scheduledStartAt = scheduledAt === undefined || scheduledAt === null
        ? null
        : new Date(scheduledAt);
    if (scheduledAt !== undefined && scheduledAt !== null
        && (Number.isNaN(scheduledStartAt.getTime()) || scheduledStartAt <= now)) {
        throw badRequest('scheduledAt must be a valid future date');
    }
    const startedAt = scheduledStartAt || now;
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
    const assessmentType = formalAssessment ? 'formal-spelling-test' : 'spelling-assessment';
    if (activeSession) {
        if (activeSession.status === 'in-progress'
            && activeSession.mode === mode
            && activeSession.assessmentType === assessmentType
            && activeSession.curriculumGrade === selectedGrade) {
            const current = await getCurrentSpellingItem({ schoolId, sessionId: activeSession._id });
            return current.session;
        }
        throw conflict('This student already has an active spelling session. End it or wait for it to finish before starting another.');
    }

    let gradeProgress = getSpellingGradeProgress(student, selectedGrade);
    if (student.spelling?.currentGrade === selectedGrade) {
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

    if (gradeProgress.week > SPELLING_GRADE_MAX_WEEK[selectedGrade]) {
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

    let selectedWeek = curriculumWeek || gradeProgress.week;
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
    if (selectedWeek > SPELLING_GRADE_MAX_WEEK[selectedGrade]) {
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
    let gradebookDetails = {};
    if (formalAssessment) {
        const classDoc = targetClassId
            ? await Class.findOne({ _id: targetClassId, school: schoolId }).select('academicYear subjects.subject').lean()
            : null;
        if (!classDoc || !classSettings?.gradebookSubject) {
            throw badRequest('Link a Gradebook subject to this class in Spelling settings before starting a formal assessment');
        }
        if (!classDoc.subjects.some((entry) => String(entry.subject) === String(classSettings.gradebookSubject))) {
            throw badRequest('The linked Gradebook subject is no longer assigned to this class');
        }
        gradebookDetails = {
            gradebookSubject: classSettings.gradebookSubject,
            gradebookClass: targetClassId,
            gradebookAcademicYear: classDoc.academicYear || student.academicYear
        };
    }
    const retestIntervalDays = classSettings?.retestIntervalDays || 7;
    const effectiveRetestDeadline = retestDeadline
        ? deadline
        : new Date(startedAt.getTime() + retestIntervalDays * DAY_MS);

    // Resolve defaults from class settings if not explicitly specified by teacher
    const effectiveEmailNotification = emailNotification !== undefined && emailNotification !== null
        ? emailNotification
        : (classSettings?.defaultEmailAudience || DEFAULT_SPELLING_EMAIL_AUDIENCE);
    const formalTestEmailAudience = formalTestWordListEmailAudience || effectiveEmailNotification;

    if (formalAssessment && (effectiveEmailNotification !== 'none' || formalTestWordListEmail)) {
        const gmailStatus = await gmailOAuthService.getTokenStatus(userId);
        const hasSendScope = gmailStatus.grantedScopes?.includes('https://www.googleapis.com/auth/gmail.send');
        if (!gmailStatus.connected || !hasSendScope) {
            const error = new Error('Connect or reconnect your Google account with Gmail sending access before starting a formal spelling quiz. No other sender will be used.');
            error.statusCode = 401;
            error.code = 'GMAIL_REAUTH_REQUIRED';
            throw error;
        }
    }

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

    const sessionData = {
        school: schoolId,
        student: studentId,
        mode,
        status: scheduledStartAt ? 'scheduled' : 'in-progress',
        scheduledAt: scheduledStartAt,
        assessmentType,
        ...gradebookDetails,
        maxMistakesAllowed: effectiveMaxMistakesAllowed,
        retestDeadline: effectiveRetestDeadline,
        retestIntervalDays,
        curriculumGrade: selectedGrade,
        curriculumWeek: selectedWeek,
        emailNotification: effectiveEmailNotification,
        passageEmailAudience: effectivePassageEmailAudience,
        passageGeneration: {
            enabled: passageGeneration.enabled === true,
            trigger: 'manual',
            style: passageGeneration.style === 'passage' ? 'passage' : 'sentence-list',
            requireTeacherApproval: true
        },
        dictationMode,
        startedAt: now,
        createdBy: userId,
        administeredBy: mode === 'teacher-led' ? userId : null
    };

    let scheduledWordList = null;
    if (formalTestWordListEmail) {
        scheduledWordList = await resolveFormalTestWordList({ schoolId, studentId });
        if (scheduledWordList.plannedWords.length === 0) {
            throw badRequest('No unresolved missed words are available for this preparation test');
        }
    }

    if (scheduledWordList) sessionData.formalTestWordList = scheduledWordList.plannedWords;

    const scheduledResult = scheduledWordList
        ? await withTransaction(async (dbSession) => {
            const [createdSession] = await SpellingSession.create([sessionData], { session: dbSession });
            const delivery = await queueFormalSpellingTestWordListEmail({
                session: createdSession,
                ...scheduledWordList,
                audience: formalTestEmailAudience,
                timeZone: formalTestWordListEmailTimezone,
                dbSession
            });
            return { session: createdSession, deliveryId: delivery._id };
        })
        : { session: await SpellingSession.create(sessionData), deliveryId: null };
    let session = scheduledResult.session;

    if (scheduledStartAt) {
        if (!scheduledResult.deliveryId) return session;
        let emailDelivery;
        try {
            emailDelivery = await processSpellingEmailDelivery({ deliveryId: scheduledResult.deliveryId });
        } catch (error) {
            logger.error('formal_spelling_test_prep_email_processing_failed', {
                deliveryId: String(scheduledResult.deliveryId),
                sessionId: String(session._id),
                message: error.message
            });
            emailDelivery = { status: 'pending', lastError: error.message };
        }
        return {
            ...session.toObject(),
            formalTestPrepEmail: {
                status: emailDelivery?.status || 'pending',
                lastError: emailDelivery?.lastError || ''
            }
        };
    }

    const current = await getCurrentSpellingItem({ schoolId, sessionId: session._id });
    return current.session;
}

export async function activateDueScheduledSpellingSessions({ now = new Date(), limit = 500 } = {}) {
    const dueSessions = await SpellingSession.find({
        status: 'scheduled',
        scheduledAt: { $lte: now }
    })
        .sort({ scheduledAt: 1 })
        .limit(Math.min(Math.max(Number(limit) || 500, 1), 2000))
        .setOptions({ skipTenantFilter: true })
        .select('_id school student scheduledAt')
        .lean();
    let sessionsActivated = 0;

    for (const dueSession of dueSessions) {
        const activated = await withTransaction(async (dbSession) => {
            const session = await SpellingSession.findOne({
                _id: dueSession._id,
                status: 'scheduled',
                scheduledAt: { $lte: now }
            }).setOptions({ skipTenantFilter: true }).session(dbSession);
            if (!session) return false;

            const activeSession = await SpellingSession.findOne({
                school: dueSession.school,
                student: dueSession.student,
                status: 'in-progress'
            }).setOptions({ skipTenantFilter: true }).select('_id').session(dbSession).lean();
            if (activeSession) return false;

            session.status = 'in-progress';
            session.startedAt = now;
            await session.save({ session: dbSession });
            return true;
        });
        if (activated) sessionsActivated += 1;
    }

    return { sessionsActivated };
}

export async function getCurrentSpellingItem({ schoolId, sessionId }) {
    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOne({ _id: sessionId, school: schoolId }).session(dbSession);
        if (!session) throw notFound('Spelling session not found');
        if (session.status !== 'in-progress') return { session, item: null };

        const existing = await getCurrentItemData(session, dbSession);
        if (existing) return { session, item: existing };

        if (session.formalTestWordList?.length) {
            const attemptedPlannedWordIndexes = new Set(session.attempts
                .map((attempt) => attempt.plannedWordIndex)
                .filter(Number.isInteger));
            const plannedWordIndex = session.formalTestWordList.findIndex((word, index) => (
                !attemptedPlannedWordIndexes.has(index)
            ));
            if (plannedWordIndex === -1) {
                session.status = 'completed';
                session.completedAt = new Date();
                session.completionReason = 'word-list-complete';
                await session.save({ session: dbSession });
                await queueSpellingCompletionEmail({ session, dbSession });
                await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
                return { session, item: null };
            }

            const plannedWord = session.formalTestWordList[plannedWordIndex];
            const sourceWord = await SpellingWord.findOne({
                _id: plannedWord.wordId,
                school: session.school
            }).session(dbSession).select('definition').lean();
            const item = {
                wordId: plannedWord.wordId,
                retestItemId: plannedWord.retestItemId,
                plannedWordIndex,
                sequence: session.nextSequence,
                word: plannedWord.wordSnapshot,
                definition: sourceWord?.definition || '',
                grade: plannedWord.grade,
                week: plannedWord.week,
                category: plannedWord.category,
                order: plannedWord.order,
                isRetest: plannedWord.isRetest
            };
            session.currentItem = {
                wordId: item.wordId,
                retestItemId: item.retestItemId,
                plannedWordIndex,
                sequence: item.sequence
            };
            await session.save({ session: dbSession });
            return { session, item };
        }

        const student = await Student.findOne({ _id: session.student, school: schoolId }).session(dbSession).lean();
        if (!student) throw notFound('Student not found');

        const attemptedWordIds = session.attempts
            .map((attempt) => attempt.wordId)
            .filter(Boolean);
        const attemptedRetestIds = session.attempts
            .map((attempt) => attempt.retestItemId)
            .filter(Boolean);

        let retestItem = null;
        if (session.assessmentType === 'retest-quiz') {
            retestItem = await SpellingRetestItem.findOne({
                school: schoolId,
                student: session.student,
                status: 'pending',
                _id: { $in: session.retestQuizItems, $nin: attemptedRetestIds }
            }).sort({
                correctRetestStreak: 1,
                incorrectRetestCount: -1,
                lastRetestedAt: 1,
                flaggedAt: 1,
                _id: 1
            }).session(dbSession).lean();
        } else if (['spelling-assessment', 'formal-spelling-test'].includes(session.assessmentType)) {
            retestItem = await SpellingRetestItem.findOne({
                school: schoolId,
                student: session.student,
                status: 'pending',
                sourceSession: { $ne: session._id },
                _id: { $nin: attemptedRetestIds }
            }).sort({ flaggedAt: 1, _id: 1 }).session(dbSession).lean();
        }

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
        } else if (
            ['spelling-assessment', 'formal-spelling-test'].includes(session.assessmentType)
            && session.curriculumGrade
            && session.curriculumWeek
        ) {
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
            session.completionReason = session.assessmentType === 'retest-quiz'
                ? 'retest-quiz-complete'
                : 'curriculum-exhausted';
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

        const item = await getCurrentItemData(session, dbSession);
        if (!item || item.sequence !== sequence) throw conflict('The requested spelling item is no longer current');

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
            plannedWordIndex: item.plannedWordIndex ?? null,
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
        session.currentItem = { wordId: null, retestItemId: null, plannedWordIndex: null, sequence: null };
        session.nextSequence += 1;

        if (item.isRetest) {
            await recordRetestOutcome({
                schoolId,
                studentId: session.student,
                retestItemId: item.retestItemId,
                correct: evaluatedCorrect,
                skipped: isSkipped,
                sessionId: session._id,
                formalTest: session.assessmentType === 'formal-spelling-test',
                at: now,
                dbSession
            });
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

        if (session.assessmentType !== 'retest-quiz' && session.mistakeCount >= session.maxMistakesAllowed) {
            session.status = 'completed';
            session.completedAt = now;
            session.completionReason = 'mistake-limit';
        } else if (
            session.formalTestWordList?.length
            && session.attempts.filter((entry) => Number.isInteger(entry.plannedWordIndex)).length >= session.formalTestWordList.length
        ) {
            session.status = 'completed';
            session.completedAt = now;
            session.completionReason = 'word-list-complete';
        }
        await session.save({ session: dbSession });
        if (session.status === 'completed' && session.assessmentType !== 'retest-quiz') {
            await queueSpellingCompletionEmail({ session, dbSession });
            await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
        }
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

        if (attempt.isRetest) {
            await recordRetestOutcome({
                schoolId,
                studentId: session.student,
                retestItemId: attempt.retestItemId,
                correct: true,
                skipped: false,
                formalTest: session.assessmentType === 'formal-spelling-test',
                sessionId: session._id,
                at: correctedAt,
                dbSession
            });
        } else if (session.assessmentType === 'formal-spelling-test') {
            await SpellingRetestItem.updateMany(
                {
                    school: schoolId,
                    student: session.student,
                    sourceWord: attempt.wordId,
                    status: { $in: ['pending', 'practice-mastered'] }
                },
                {
                    $set: {
                        status: 'resolved',
                        resolvedAt: correctedAt,
                        resolvedBySession: session._id
                    },
                    $unset: { practiceMasteredAt: 1, practiceMasteredBySession: 1 }
                },
                { session: dbSession }
            );
        } else {
            await SpellingRetestItem.updateMany(
                {
                    school: schoolId,
                    student: session.student,
                    sourceWord: attempt.wordId,
                    status: 'pending'
                },
                {
                    $set: {
                        status: 'practice-mastered',
                        practiceMasteredAt: correctedAt,
                        practiceMasteredBySession: session._id
                    }
                },
                { session: dbSession }
            );
        }

        await session.save({ session: dbSession });
        if (session.status === 'completed') {
            await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
        }
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
        await saveFormalSpellingGradebookEntry({ schoolId, session, dbSession });
        return { session, idempotent: false };
    });
}

export async function cancelScheduledSpellingSession({ schoolId, sessionId }) {
    return withTransaction(async (dbSession) => {
        const session = await SpellingSession.findOneAndUpdate(
            { _id: sessionId, school: schoolId, status: 'scheduled' },
            { $set: { status: 'abandoned', completedAt: new Date() } },
            { new: true, session: dbSession }
        );
        if (!session) {
            const existing = await SpellingSession.findOne({ _id: sessionId, school: schoolId })
                .select('status')
                .session(dbSession)
                .lean();
            if (!existing) throw notFound('Spelling session not found');
            throw conflict('Only a scheduled spelling session can be cancelled');
        }

        await SpellingEmailDelivery.updateMany(
            {
                school: schoolId,
                session: session._id,
                kind: 'formal-test-prep',
                status: { $in: ['staging', 'pending'] }
            },
            { $set: { status: 'cancelled', lastError: 'Scheduled spelling test cancelled' } },
            { session: dbSession }
        );
        return session;
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
