/**
 * Student AI tutor.
 *
 * Two rules shape this file:
 * 1. The tutor answers only from the lessons imported for the student's subject
 *    and grade, and the standards for that grade are part of the prompt.
 * 2. A student's credit is their own wallet, separate from teacher AI credit.
 *    One credit buys one question; unused credit carries into the next term.
 *
 * The AI is called here and nowhere else in the tutor module. Marking practice
 * questions never calls the AI — it compares saved answers with saved keys.
 */
import mongoose from 'mongoose';

import TutorLesson from '../models/TutorLesson.js';
import TutorSettings from '../models/TutorSettings.js';
import TutorClassAccess from '../models/TutorClassAccess.js';
import TutorWallet from '../models/TutorWallet.js';
import TutorCreditEntry from '../models/TutorCreditEntry.js';
import TutorConversation from '../models/TutorConversation.js';
import TutorPracticeSet from '../models/TutorPracticeSet.js';
import Student from '../models/Student.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Standard from '../models/Standard.js';
import Teacher from '../models/Teacher.js';

import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';
import aiService from './aiservice.js';
import {
    FREE_AFTER_CREDITS,
    HISTORY_IN_PROMPT,
    STANDARDS_IN_ANSWER,
    buildPracticePrompt,
    buildTutorPrompt,
    countTries,
    gradePractice,
    lessonLabel,
    normalizePracticeQuestions,
    readTutorReply,
    resolveAccess,
    selectLessons,
    summarizeLessonsByUnit,
    validateLessonImport,
    walletNotice,
    words
} from './tutorCore.js';

/**
 * The student tutor runs on GPT. It is an explicit provider, not a preference:
 * a missing OpenAI key fails loudly instead of quietly falling back to another
 * model that was never approved for student conversations.
 */
const TUTOR_AI = { usage: false, provider: 'openai' };

const MAX_QUESTION_CHARS = 1500;
const MAX_CONVERSATION_MESSAGES = 80;
const LESSON_LIST_FIELDS = 'unitNumber unitTitle chapterNumber chapterTitle lessonNumber title standards keywords';
const LESSON_SEARCH_FIELDS = `${LESSON_LIST_FIELDS} searchText`;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message, code) => Object.assign(new Error(message), { statusCode: 403, code });
const paymentRequired = (message, code = 'TUTOR_NO_CREDIT') => Object.assign(new Error(message), { statusCode: 402, code });

const objectId = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);
const startOfToday = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

/* ------------------------------------------------------------------ */
/* Settings and class access                                           */
/* ------------------------------------------------------------------ */

export const DEFAULT_TUTOR_SETTINGS = {
    enabled: false,
    practiceEnabled: true,
    dailyMessageLimit: 40,
    defaultCredits: 30
};

export const getTutorSettings = async (schoolId) => {
    const row = await TutorSettings.findOne({ school: schoolId }).lean();
    if (!row) return { ...DEFAULT_TUTOR_SETTINGS, updatedAt: null };
    return {
        enabled: row.enabled === true,
        practiceEnabled: row.practiceEnabled !== false,
        dailyMessageLimit: Number(row.dailyMessageLimit ?? DEFAULT_TUTOR_SETTINGS.dailyMessageLimit),
        defaultCredits: Number(row.defaultCredits ?? DEFAULT_TUTOR_SETTINGS.defaultCredits),
        updatedAt: row.updatedAt || null
    };
};

export const saveTutorSettings = async ({ schoolId, userId, patch = {} }) => {
    const set = {};
    if (patch.enabled !== undefined) {
        if (typeof patch.enabled !== 'boolean') throw badRequest('enabled must be true or false.');
        set.enabled = patch.enabled;
    }
    if (patch.practiceEnabled !== undefined) {
        if (typeof patch.practiceEnabled !== 'boolean') throw badRequest('practiceEnabled must be true or false.');
        set.practiceEnabled = patch.practiceEnabled;
    }
    for (const [field, min, max, label] of [
        ['dailyMessageLimit', 1, 200, 'daily message limit'],
        ['defaultCredits', 0, 1000, 'default credit amount']
    ]) {
        if (patch[field] === undefined) continue;
        const value = Number(patch[field]);
        if (!Number.isInteger(value) || value < min || value > max) {
            throw badRequest(`The ${label} must be a whole number from ${min} to ${max}.`);
        }
        set[field] = value;
    }
    if (!Object.keys(set).length) throw badRequest('Nothing to change.');
    set.updatedBy = userId;

    await TutorSettings.findOneAndUpdate(
        { school: schoolId },
        { $set: set, $setOnInsert: { school: schoolId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return getTutorSettings(schoolId);
};

/** The class row is optional; no row means the class follows the school switch. */
export const getClassAccess = async (schoolId, classId) => (
    classId ? TutorClassAccess.findOne({ school: schoolId, class: classId }).lean() : null
);

export const setClassAccess = async ({ schoolId, classId, userId, status, note = '' }) => {
    if (!['on', 'paused', 'locked'].includes(status)) {
        throw badRequest('Pick on, paused or locked for this class.');
    }
    const classDoc = await Class.findOne({ _id: classId, school: schoolId }).select('_id').lean();
    if (!classDoc) throw notFound('Class not found.');
    const row = await TutorClassAccess.findOneAndUpdate(
        { school: schoolId, class: classId },
        {
            $set: {
                status,
                note: String(note || '').trim().slice(0, 300),
                updatedBy: userId
            },
            $setOnInsert: { school: schoolId, class: classId }
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return { classId: String(classId), status: row.status, note: row.note || '', updatedAt: row.updatedAt };
};

/* ------------------------------------------------------------------ */
/* Student scope                                                       */
/* ------------------------------------------------------------------ */

/**
 * A student's grade and class decide which lessons they can reach. Everything the
 * tutor says is scoped by this pair; there is no path that reads another grade's
 * lessons.
 */
export const studentScope = async ({ schoolId, student }) => {
    let classDoc = null;
    if (student?.currentClass) {
        classDoc = await Class.findOne({ _id: student.currentClass, school: schoolId })
            .select('name grade academicYear subjects')
            .lean();
    }
    if (!classDoc && student?.enrolledClasses?.length) {
        classDoc = await Class.findOne({ _id: { $in: student.enrolledClasses }, school: schoolId })
            .select('name grade academicYear subjects')
            .sort({ createdAt: -1 })
            .lean();
    }
    const grade = Number(classDoc?.grade) || 0;
    if (!grade) {
        throw badRequest('This student has no class with a grade, so there are no lessons to study yet.');
    }
    return { grade, classDoc };
};

/** Subjects that have lessons for the student's grade, narrowed to their class when set. */
export const subjectsForStudent = async ({ schoolId, grade, classDoc }) => {
    const rows = await TutorLesson.aggregate([
        { $match: { school: objectId(schoolId), grade, isActive: true } },
        { $group: { _id: '$subject', lessons: { $sum: 1 } } }
    ]);
    if (!rows.length) return [];
    const byId = new Map(rows.map((row) => [String(row._id), row.lessons]));
    const subjects = await Subject.find({ school: schoolId, _id: { $in: rows.map((row) => row._id) } })
        .select('name nameAr code')
        .lean();
    const taught = new Set((classDoc?.subjects || []).map((entry) => String(entry.subject)));
    return subjects
        .filter((subject) => !taught.size || taught.has(String(subject._id)))
        .map((subject) => ({
            id: String(subject._id),
            name: subject.name || subject.code || '',
            nameAr: subject.nameAr || '',
            code: subject.code || '',
            lessons: byId.get(String(subject._id)) || 0
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
};

/** Admin list: every subject a grade may be given lessons for, lessons or not. */
export const subjectsForGrade = async ({ schoolId, grade }) => {
    const number = Number(grade);
    const subjects = await Subject.find({ school: schoolId, isActive: { $ne: false } })
        .select('name nameAr code applicableGrades')
        .sort({ name: 1 })
        .lean();
    const counts = await TutorLesson.aggregate([
        { $match: { school: objectId(schoolId), grade: number, isActive: true } },
        { $group: { _id: '$subject', lessons: { $sum: 1 } } }
    ]);
    const countBy = new Map(counts.map((row) => [String(row._id), row.lessons]));
    return subjects
        .filter((subject) => !subject.applicableGrades?.length || subject.applicableGrades.includes(number))
        .map((subject) => ({
            id: String(subject._id),
            name: subject.name || subject.code || '',
            nameAr: subject.nameAr || '',
            code: subject.code || '',
            lessons: countBy.get(String(subject._id)) || 0
        }));
};

export const lessonOutline = async ({ schoolId, subjectId, grade }) => {
    const lessons = await TutorLesson.find({ school: schoolId, subject: subjectId, grade, isActive: true })
        .select(LESSON_LIST_FIELDS)
        .sort({ unitNumber: 1, chapterNumber: 1, lessonNumber: 1 })
        .lean();
    return summarizeLessonsByUnit(lessons.map((lesson) => ({
        id: String(lesson._id),
        unitNumber: lesson.unitNumber,
        unitTitle: lesson.unitTitle,
        chapterNumber: lesson.chapterNumber,
        chapterTitle: lesson.chapterTitle,
        lessonNumber: lesson.lessonNumber,
        title: lesson.title,
        standards: lesson.standards || []
    })));
};

export const standardsForGrade = async ({ schoolId, subjectId, grade, limit = 60 }) => {
    const standards = await Standard.find({ school: schoolId, subject: subjectId, gradeLevel: grade, isActive: { $ne: false } })
        .select('code name description')
        .sort({ code: 1 })
        .limit(limit)
        .lean();
    return standards.map((standard) => ({
        code: standard.code,
        name: standard.name,
        description: standard.description
    }));
};

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

const walletShape = (wallet) => ({
    credits: Math.max(0, Number(wallet?.credits) || 0),
    granted: Number(wallet?.granted) || 0,
    spent: Number(wallet?.spent) || 0,
    paused: Boolean(wallet?.paused),
    notice: walletNotice({ credits: wallet?.credits, lowThreshold: FREE_AFTER_CREDITS })
});

export const ensureWallet = async ({ schoolId, student }) => {
    const row = await TutorWallet.findOneAndUpdate(
        { school: schoolId, student: student._id },
        { $setOnInsert: { school: schoolId, student: student._id, user: student.user || null } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return row;
};

/** Adds credit; it never replaces the balance, so nothing is lost at a term change. */
export const grantCredits = async ({ schoolId, studentIds = [], credits, userId, note = '' }) => {
    const amount = Number(credits);
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000) {
        throw badRequest('Credits must be a whole number from 0 to 1000.');
    }
    if (!Array.isArray(studentIds) || !studentIds.length) throw badRequest('Pick at least one student.');
    if (studentIds.length > 500) throw badRequest('Give credit to no more than 500 students at once.');

    const ids = studentIds.map(objectId).filter(Boolean);
    const students = await Student.find({ school: schoolId, _id: { $in: ids } }).select('_id user').lean();
    if (students.length !== ids.length) throw notFound('One of the students is not in this school.');

    const updated = [];
    for (const student of students) {
        const wallet = await TutorWallet.findOneAndUpdate(
            { school: schoolId, student: student._id },
            {
                $inc: { credits: amount, granted: amount },
                $set: { lastGrantAt: new Date() },
                $setOnInsert: { school: schoolId, student: student._id, user: student.user || null }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();
        await TutorCreditEntry.create({
            school: schoolId,
            student: student._id,
            type: 'grant',
            credits: amount,
            balanceAfter: wallet.credits,
            note: String(note || '').trim().slice(0, 300),
            by: userId
        });
        updated.push({ studentId: String(student._id), ...walletShape(wallet) });
    }
    return updated;
};

export const setWalletPaused = async ({ schoolId, studentId, userId, paused }) => {
    if (typeof paused !== 'boolean') throw badRequest('Paused must be true or false.');
    const wallet = await TutorWallet.findOneAndUpdate(
        { school: schoolId, student: studentId },
        { $set: { paused }, $setOnInsert: { school: schoolId, student: studentId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    await TutorCreditEntry.create({
        school: schoolId,
        student: studentId,
        type: 'adjust',
        credits: 0,
        balanceAfter: wallet.credits,
        note: paused ? 'Tutor paused for this student' : 'Tutor turned back on for this student',
        by: userId
    });
    return { studentId: String(studentId), ...walletShape(wallet) };
};

/** Claims one credit for a question. Returns null when there is nothing to claim. */
const claimCredit = async ({ schoolId, student, conversationId = null, practiceId = null, note = 'Tutor question' }) => {
    const wallet = await TutorWallet.findOneAndUpdate(
        {
            school: schoolId,
            student: student._id,
            paused: { $ne: true },
            credits: { $gte: 1 }
        },
        { $inc: { credits: -1, spent: 1 } },
        { new: true }
    ).lean();
    if (!wallet) return null;
    await TutorCreditEntry.create({
        school: schoolId,
        student: student._id,
        type: 'spend',
        credits: -1,
        balanceAfter: wallet.credits,
        note,
        conversation: conversationId,
        practice: practiceId
    });
    return wallet;
};

const refundCredit = async ({ schoolId, student, conversationId = null, practiceId = null, note = 'Tutor failed to answer' }) => {
    const wallet = await TutorWallet.findOneAndUpdate(
        { school: schoolId, student: student._id },
        { $inc: { credits: 1, spent: -1 } },
        { new: true }
    ).lean();
    if (!wallet) return null;
    await TutorCreditEntry.create({
        school: schoolId,
        student: student._id,
        type: 'refund',
        credits: 1,
        balanceAfter: wallet.credits,
        note,
        conversation: conversationId,
        practice: practiceId
    });
    return wallet;
};

/* ------------------------------------------------------------------ */
/* Conversation helpers                                                */
/* ------------------------------------------------------------------ */

const publicMessages = (messages = []) => messages.map((message) => ({
    id: String(message._id),
    role: message.role,
    stage: message.stage || null,
    text: message.role === 'tutor' ? String(message.text || '').slice(0, 6000) : String(message.text || ''),
    at: message.at
}));

const conversationFor = async ({ schoolId, student, subjectId, classId, academicYear }) => {
    const open = await TutorConversation.findOne({
        school: schoolId,
        student: student._id,
        subject: subjectId,
        status: 'open'
    }).sort({ lastMessageAt: -1 });
    if (open && (open.messages || []).length < MAX_CONVERSATION_MESSAGES) return open;
    if (open) {
        open.status = 'full';
        await open.save();
    }
    return new TutorConversation({
        school: schoolId,
        student: student._id,
        subject: subjectId,
        class: classId || null,
        academicYear: academicYear || ''
    });
};

const assertStudentCanAsk = async ({ schoolId, student, settings, wallet, checkCredits = true }) => {
    const access = await getClassAccess(schoolId, student.currentClass);
    const decision = resolveAccess({ settings, classAccess: access, walletPaid: wallet?.paused });
    if (!decision.allowed) {
        const copy = {
            school_off: ['The AI tutor is turned off for your school right now.', 'TUTOR_SCHOOL_OFF'],
            class_locked: ['The AI tutor is not available for your class.', 'TUTOR_CLASS_LOCKED'],
            class_paused: ['The AI tutor is paused for your class right now.', 'TUTOR_CLASS_PAUSED'],
            wallet_paused: ['Your tutor access is paused. Ask your teacher or the school office.', 'TUTOR_STUDENT_PAUSED']
        }[decision.reason] || ['The AI tutor is not available right now.', 'TUTOR_UNAVAILABLE'];
        throw forbidden(copy[0], copy[1]);
    }
    if (checkCredits && Number(wallet?.credits) <= 0) {
        throw paymentRequired('You have used all your tutor questions. Ask your teacher or the school office for more.');
    }
};

/* ------------------------------------------------------------------ */
/* Asking                                                              */
/* ------------------------------------------------------------------ */

const lessonSearchScope = async ({ schoolId, subjectId, grade }) => TutorLesson.find({
    school: schoolId,
    subject: subjectId,
    grade,
    isActive: true
}).select(LESSON_SEARCH_FIELDS).lean();

const pickLessons = async ({ schoolId, subjectId, grade, question, lessonId }) => {
    const candidates = await lessonSearchScope({ schoolId, subjectId, grade });
    if (!candidates.length) return [];
    const chosen = selectLessons({ lessons: candidates, question, selectedLessonId: lessonId });
    // A vague question ("help me revise") matches no words, so the first lessons of
    // the subject keep the scope real instead of turning the tutor into a dead end.
    const ids = (chosen.length ? chosen : candidates.slice(0, 3)).map((lesson) => lesson._id);
    // The search rows carry only a short excerpt; read the full text for the few
    // lessons that will actually be quoted to the model.
    return TutorLesson.find({ school: schoolId, _id: { $in: ids } })
        .select(`${LESSON_LIST_FIELDS} content`)
        .lean();
};

export const askTutor = async ({
    schoolId,
    student,
    subjectId,
    lessonId = null,
    question,
    language = 'en'
}) => {
    const trimmed = String(question ?? '').trim();
    if (!trimmed) throw badRequest('Type a question first.');
    if (trimmed.length > MAX_QUESTION_CHARS) {
        throw badRequest(`Keep the question under ${MAX_QUESTION_CHARS} characters.`);
    }
    const subject = objectId(subjectId);
    if (!subject) throw badRequest('Pick the subject you want to study first.');
    const subjectDoc = await Subject.findOne({ _id: subject, school: schoolId }).select('name').lean();
    if (!subjectDoc) throw notFound('Subject not found.');

    const settings = await getTutorSettings(schoolId);
    const wallet = await ensureWallet({ schoolId, student });
    await assertStudentCanAsk({ schoolId, student, settings, wallet });

    const today = await TutorCreditEntry.countDocuments({
        school: schoolId,
        student: student._id,
        type: 'spend',
        createdAt: { $gte: startOfToday() }
    });
    if (today >= settings.dailyMessageLimit) {
        throw Object.assign(
            new Error(`You have asked ${settings.dailyMessageLimit} questions today. You can ask again tomorrow.`),
            { statusCode: 429, code: 'TUTOR_DAILY_LIMIT' }
        );
    }

    const { grade, classDoc } = await studentScope({ schoolId, student });
    const lessons = await pickLessons({ schoolId, subjectId: subject, grade, question: trimmed, lessonId });
    if (!lessons.length) {
        throw badRequest(`There are no ${subjectDoc.name} lessons for grade ${grade} yet. Ask your teacher to add them.`);
    }

    const standards = await standardsForGrade({ schoolId, subjectId: subject, grade, limit: STANDARDS_IN_ANSWER });
    const selected = lessonId ? lessons.find((lesson) => String(lesson._id) === String(lessonId)) || null : null;
    // The ladder is per question, so it is read from the thread before this message
    // is added: a finished explanation closes it and the next question starts over.
    const conversation = await conversationFor({
        schoolId,
        student,
        subjectId: subject,
        classId: classDoc?._id,
        academicYear: classDoc?.academicYear || student.academicYear || ''
    });
    const priorMessages = (conversation.messages || []).map((message) => ({
        role: message.role,
        text: message.text,
        stage: message.stage || null
    }));
    const prompt = buildTutorPrompt({
        question: trimmed,
        lessons,
        standards,
        subjectName: subjectDoc.name,
        grade,
        language,
        selectedLesson: selected,
        history: priorMessages.slice(-HISTORY_IN_PROMPT),
        tries: countTries(priorMessages)
    });

    const charged = await claimCredit({ schoolId, student, conversationId: conversation._id });
    if (!charged) {
        throw paymentRequired('You have used all your tutor questions. Ask your teacher or the school office for more.');
    }

    let reply;
    try {
        reply = await connectAi(prompt, TUTOR_AI);
    } catch (error) {
        await refundCredit({ schoolId, student, conversationId: conversation._id });
        logger.warn('tutor_ai_failed', { schoolId: String(schoolId), error: error?.message });
        throw Object.assign(new Error('The tutor could not answer just now. Your question credit was returned.'), {
            statusCode: 502,
            code: 'TUTOR_AI_FAILED'
        });
    }

    const { stage, text: answer } = readTutorReply(reply?.text);
    if (!answer) {
        await refundCredit({ schoolId, student, conversationId: conversation._id });
        throw Object.assign(new Error('The tutor sent an empty answer. Your question credit was returned.'), {
            statusCode: 502,
            code: 'TUTOR_AI_EMPTY'
        });
    }

    conversation.messages.push(
        { role: 'student', text: trimmed, at: new Date() },
        {
            role: 'tutor',
            text: answer,
            stage,
            lessonIds: lessons.map((lesson) => lesson._id),
            credits: 1,
            tokens: Number(reply?.totalTokenCount) || 0,
            model: String(reply?.modelName || ''),
            at: new Date()
        }
    );
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    conversation.lastMessageAt = new Date();
    await conversation.save();

    const after = await ensureWallet({ schoolId, student });
    return {
        answer,
        stage,
        lessons: lessons.map((lesson) => ({
            id: String(lesson._id),
            label: lessonLabel(lesson)
        })),
        conversationId: String(conversation._id),
        balance: walletShape(after)
    };
};

/* ------------------------------------------------------------------ */
/* Practice                                                            */
/* ------------------------------------------------------------------ */

const practiceLessons = async ({ schoolId, student, subjectId, grade, lessonId, fallbackLessonIds = [] }) => {
    if (lessonId) {
        const lesson = await TutorLesson.findOne({ school: schoolId, _id: lessonId, grade, isActive: true }).lean();
        if (lesson) return [lesson];
    }
    if (fallbackLessonIds.length) {
        const recent = await TutorLesson.find({ school: schoolId, _id: { $in: fallbackLessonIds }, isActive: true }).lean();
        if (recent.length) return recent;
    }
    return TutorLesson.find({ school: schoolId, subject: subjectId, grade, isActive: true })
        .sort({ unitNumber: 1, chapterNumber: 1, lessonNumber: 1 })
        .limit(3)
        .lean();
};

const shapePractice = (set, { withKey = false } = {}) => ({
    id: String(set._id),
    subject: String(set.subject),
    status: set.status,
    score: set.score ?? null,
    total: (set.questions || []).length,
    createdAt: set.createdAt,
    submittedAt: set.submittedAt || null,
    questions: (set.questions || []).map((question, index) => ({
        index,
        question: question.question,
        options: question.options,
        ...(withKey && set.status === 'submitted'
            ? { correctIndex: question.correctIndex, explanation: question.explanation }
            : {})
    }))
});

export const generatePractice = async ({ schoolId, student, subjectId, lessonId = null, language = 'en' }) => {
    const subject = objectId(subjectId);
    if (!subject) throw badRequest('Pick the subject you want to practise first.');
    const subjectDoc = await Subject.findOne({ _id: subject, school: schoolId }).select('name').lean();
    if (!subjectDoc) throw notFound('Subject not found.');

    const settings = await getTutorSettings(schoolId);
    if (!settings.practiceEnabled) {
        throw forbidden('Practice questions are turned off for your school right now.', 'TUTOR_PRACTICE_OFF');
    }
    const wallet = await ensureWallet({ schoolId, student });
    await assertStudentCanAsk({ schoolId, student, settings, wallet });

    const { grade } = await studentScope({ schoolId, student });
    const recent = await TutorConversation.find({ school: schoolId, student: student._id, subject: subject })
        .sort({ lastMessageAt: -1 })
        .limit(3)
        .select('messages.lessonIds')
        .lean();
    const fallbackLessonIds = [...new Set(recent
        .flatMap((conversation) => (conversation.messages || []).flatMap((message) => message.lessonIds || []))
        .map(String))].slice(0, 6);

    const lessons = await practiceLessons({ schoolId, student, subjectId: subject, grade, lessonId, fallbackLessonIds });
    if (!lessons.length) throw badRequest(`There are no ${subjectDoc.name} lessons for grade ${grade} yet.`);
    const standards = await standardsForGrade({ schoolId, subjectId: subject, grade, limit: STANDARDS_IN_ANSWER });

    const charged = await claimCredit({ schoolId, student, note: 'Practice set' });
    if (!charged) throw paymentRequired('You have used all your tutor questions. Ask your teacher or the school office for more.');

    let reply;
    let questions = [];
    try {
        reply = await connectAi(buildPracticePrompt({
            lessons,
            standards,
            subjectName: subjectDoc.name,
            grade,
            language
        }), TUTOR_AI);
        questions = normalizePracticeQuestions(aiService.parseJsonObject(reply?.text || ''));
    } catch (error) {
        logger.warn('tutor_practice_failed', { schoolId: String(schoolId), error: error?.message });
    }

    if (questions.length < 3) {
        await refundCredit({ schoolId, student, note: 'Practice set failed' });
        throw Object.assign(new Error('The tutor could not build the practice questions. Your credit was returned — try again.'), {
            statusCode: 502,
            code: 'TUTOR_PRACTICE_FAILED'
        });
    }

    const set = await TutorPracticeSet.create({
        school: schoolId,
        student: student._id,
        subject: subject,
        grade,
        lessonIds: lessons.map((lesson) => lesson._id),
        questions,
        status: 'open'
    });
    const after = await ensureWallet({ schoolId, student });
    return { ...shapePractice(set.toObject()), balance: walletShape(after) };
};

export const submitPractice = async ({ schoolId, student, setId, answers }) => {
    const set = await TutorPracticeSet.findOne({ school: schoolId, _id: setId, student: student._id }).lean();
    if (!set) throw notFound('Practice set not found.');
    if (set.status === 'submitted') throw badRequest('This practice set was already submitted.');
    const marked = gradePractice(set.questions, answers);
    await TutorPracticeSet.updateOne(
        { _id: set._id, school: schoolId, status: 'open' },
        {
            $set: {
                answers: marked.results,
                score: marked.score,
                status: 'submitted',
                submittedAt: new Date()
            }
        }
    );
    const shaped = shapePractice(
        { ...set, status: 'submitted', score: marked.score, submittedAt: new Date() },
        { withKey: true }
    );
    return {
        ...shaped,
        questions: shaped.questions.map((question, index) => ({
            ...question,
            choiceIndex: marked.results[index]?.choiceIndex ?? null,
            correct: Boolean(marked.results[index]?.correct)
        }))
    };
};

export const getPracticeSet = async ({ schoolId, student, setId }) => {
    const set = await TutorPracticeSet.findOne({ school: schoolId, _id: setId, student: student._id }).lean();
    if (!set) throw notFound('Practice set not found.');
    const shaped = shapePractice(set, { withKey: true });
    return {
        ...shaped,
        questions: shaped.questions.map((question, index) => ({
            ...question,
            choiceIndex: set.answers?.[index]?.choiceIndex ?? null,
            correct: set.answers?.[index]?.correct ?? null
        }))
    };
};

/* ------------------------------------------------------------------ */
/* Student reads                                                       */
/* ------------------------------------------------------------------ */

const studentState = async ({ schoolId, student }) => {
    const settings = await getTutorSettings(schoolId);
    const wallet = await ensureWallet({ schoolId, student });
    const access = await getClassAccess(schoolId, student.currentClass);
    const decision = resolveAccess({ settings, classAccess: access, walletPaid: wallet.paused });
    const { grade, classDoc } = await studentScope({ schoolId, student });
    const subjects = decision.allowed ? await subjectsForStudent({ schoolId, grade, classDoc }) : [];
    return {
        settings,
        wallet: walletShape(wallet),
        access: decision,
        grade,
        className: classDoc?.name || '',
        subjects
    };
};

export const getStudentTutorHome = async ({ schoolId, student, subjectId = null }) => {
    const state = await studentState({ schoolId, student });
    let outline = [];
    let selectedSubject = null;
    if (state.access.allowed && subjectId) {
        const subject = objectId(subjectId);
        const match = state.subjects.find((row) => row.id === String(subject));
        if (!match) throw forbidden('This subject is not part of your class lessons.', 'TUTOR_SUBJECT_OUT_OF_SCOPE');
        selectedSubject = match;
        outline = await lessonOutline({ schoolId, subjectId: subject, grade: state.grade });
    }
    return {
        enabled: state.settings.enabled,
        access: state.access,
        grade: state.grade,
        className: state.className,
        wallet: state.wallet,
        subjects: state.subjects,
        subject: selectedSubject,
        outline,
        practiceEnabled: state.settings.practiceEnabled
    };
};

export const getStudentHistory = async ({ schoolId, student, subjectId = null, limit = 40 }) => {
    const filter = { school: schoolId, student: student._id };
    if (subjectId) filter.subject = subjectId;
    const conversations = await TutorConversation.find(filter)
        .sort({ lastMessageAt: -1 })
        .limit(3)
        .lean();
    const practice = await TutorPracticeSet.find(filter)
        .sort({ createdAt: -1 })
        .limit(10)
        .select('subject status score questions createdAt submittedAt')
        .lean();
    return {
        conversations: conversations.map((conversation) => ({
            id: String(conversation._id),
            subject: String(conversation.subject),
            lastMessageAt: conversation.lastMessageAt,
            messages: publicMessages((conversation.messages || []).slice(-limit))
        })).reverse(),
        practice: practice.map((set) => ({
            id: String(set._id),
            subject: String(set.subject),
            status: set.status,
            score: set.score ?? null,
            total: (set.questions || []).length,
            createdAt: set.createdAt,
            submittedAt: set.submittedAt || null
        }))
    };
};

/* ------------------------------------------------------------------ */
/* Teacher and admin reads                                             */
/* ------------------------------------------------------------------ */

const teacherClassIds = async ({ schoolId, user, isAdmin = false }) => {
    // Admins read the whole school; a teacher only the classes they lead or teach.
    if (isAdmin) {
        const all = await Class.find({ school: schoolId }).select('_id').lean();
        return all.map((row) => row._id);
    }
    const teacher = await Teacher.findOne({ school: schoolId, user: user._id }).select('_id').lean();
    if (!teacher) return [];
    const classes = await Class.find({
        school: schoolId,
        $or: [{ classTeacher: teacher._id }, { 'subjects.teacher': teacher._id }]
    }).select('_id').lean();
    return classes.map((row) => row._id);
};

/** A teacher sees only the students of the classes they teach; an admin sees the school. */
export const conversationsForTeacher = async ({ schoolId, user, classId = null, studentId = null, limit = 50 }) => {
    const isAdmin = ['admin', 'super_admin'].includes(String(user?.role || ''));
    const classIds = await teacherClassIds({ schoolId, user, isAdmin });
    if (!classIds.length) return { conversations: [], students: [] };
    const classes = await Class.find({ school: schoolId, _id: { $in: classIds } }).select('name grade').lean();
    const classNameById = new Map(classes.map((row) => [String(row._id), row.name]));

    const studentFilter = {
        school: schoolId,
        $or: [{ currentClass: { $in: classIds } }, { enrolledClasses: { $in: classIds } }]
    };
    if (classId) {
        if (!classIds.some((id) => String(id) === String(classId))) {
            throw forbidden('This class is not one of your classes.', 'TUTOR_CLASS_OUT_OF_SCOPE');
        }
        studentFilter.$or = [{ currentClass: classId }, { enrolledClasses: classId }];
    }
    if (studentId) studentFilter._id = objectId(studentId);

    const students = await Student.find(studentFilter)
        .select('firstName lastName currentClass')
        .sort({ firstName: 1, lastName: 1 })
        .limit(400)
        .lean();
    const studentIds = students.map((row) => row._id);
    const studentById = new Map(students.map((row) => [String(row._id), row]));

    const conversations = await TutorConversation.find({
        school: schoolId,
        student: { $in: studentIds },
        ...(classId ? { class: classId } : {})
    })
        .sort({ lastMessageAt: -1 })
        .limit(limit)
        .lean();

    const subjectIds = [...new Set(conversations.map((row) => String(row.subject)))];
    const subjects = subjectIds.length
        ? await Subject.find({ school: schoolId, _id: { $in: subjectIds } }).select('name').lean()
        : [];
    const subjectNameById = new Map(subjects.map((row) => [String(row._id), row.name]));

    return {
        students: students.map((row) => ({
            id: String(row._id),
            name: `${row.firstName || ''} ${row.lastName || ''}`.trim(),
            classId: String(row.currentClass || ''),
            className: classNameById.get(String(row.currentClass)) || ''
        })),
        conversations: conversations.map((conversation) => {
            const student = studentById.get(String(conversation.student));
            const last = [...(conversation.messages || [])].reverse().find((message) => message.role === 'student');
            return {
                id: String(conversation._id),
                studentId: String(conversation.student),
                studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : '',
                className: classNameById.get(String(conversation.class)) || '',
                subject: subjectNameById.get(String(conversation.subject)) || '',
                lastMessageAt: conversation.lastMessageAt,
                messageCount: conversation.messageCount || 0,
                preview: String(last?.text || '').slice(0, 200)
            };
        })
    };
};

export const conversationForTeacher = async ({ schoolId, user, isAdmin, conversationId }) => {
    const conversation = await TutorConversation.findOne({ school: schoolId, _id: conversationId }).lean();
    if (!conversation) throw notFound('Conversation not found.');
    if (!isAdmin) {
        const student = await Student.findOne({ school: schoolId, _id: conversation.student })
            .select('currentClass enrolledClasses')
            .lean();
        const classIds = await teacherClassIds({ schoolId, user });
        const inClass = [student?.currentClass, ...(student?.enrolledClasses || [])]
            .filter(Boolean)
            .some((id) => classIds.some((classId) => String(classId) === String(id)));
        if (!inClass) throw forbidden('This conversation belongs to a student outside your classes.', 'TUTOR_CONVERSATION_OUT_OF_SCOPE');
    }
    const [student, subject] = await Promise.all([
        Student.findOne({ school: schoolId, _id: conversation.student }).select('firstName lastName').lean(),
        Subject.findOne({ school: schoolId, _id: conversation.subject }).select('name').lean()
    ]);
    return {
        id: String(conversation._id),
        studentName: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() : '',
        subject: subject?.name || '',
        lastMessageAt: conversation.lastMessageAt,
        messages: publicMessages(conversation.messages || [])
    };
};

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const getAdminOverview = async ({ schoolId, academicYear }) => {
    const settings = await getTutorSettings(schoolId);
    const classes = await Class.find({ school: schoolId, ...(academicYear ? { academicYear } : {}) })
        .select('name grade academicYear')
        .sort({ grade: 1, name: 1 })
        .lean();
    const access = await TutorClassAccess.find({ school: schoolId }).lean();
    const accessBy = new Map(access.map((row) => [String(row.class), row]));
    const counts = await Student.aggregate([
        { $match: { school: objectId(schoolId), ...(academicYear ? { academicYear } : {}) } },
        { $group: { _id: '$currentClass', students: { $sum: 1 } } }
    ]);
    const countBy = new Map(counts.map((row) => [String(row._id), row.students]));

    const leaves = await TutorLesson.aggregate([
        { $match: { school: objectId(schoolId), isActive: true } },
        { $group: { _id: { subject: '$subject', grade: '$grade' }, lessons: { $sum: 1 } } }
    ]);
    const subjectIds = [...new Set(leaves.map((row) => String(row._id.subject)))];
    const subjects = subjectIds.length
        ? await Subject.find({ school: schoolId, _id: { $in: subjectIds } }).select('name code').lean()
        : [];
    const subjectById = new Map(subjects.map((row) => [String(row._id), row]));

    const wallets = await TutorWallet.aggregate([
        { $match: { school: objectId(schoolId) } },
        { $group: { _id: null, credits: { $sum: '$credits' }, spent: { $sum: '$spent' }, students: { $sum: 1 } } }
    ]);

    const grades = [...new Set(classes.map((row) => row.grade))].sort((left, right) => left - right);
    return {
        settings,
        gradeOptions: grades,
        classes: classes.map((row) => ({
            id: String(row._id),
            name: row.name,
            grade: row.grade,
            students: countBy.get(String(row._id)) || 0,
            status: accessBy.get(String(row._id))?.status || 'on',
            note: accessBy.get(String(row._id))?.note || ''
        })),
        catalog: leaves.map((row) => ({
            subjectId: String(row._id.subject),
            subject: subjectById.get(String(row._id.subject))?.name || '',
            code: subjectById.get(String(row._id.subject))?.code || '',
            grade: row._id.grade,
            lessons: row.lessons
        })),
        totals: {
            credits: wallets[0]?.credits || 0,
            spent: wallets[0]?.spent || 0,
            studentsWithWallet: wallets[0]?.students || 0
        }
    };
};

export const listAdminStudents = async ({ schoolId, classId, search = '' }) => {
    const filter = { school: schoolId };
    if (classId) filter.$or = [{ currentClass: classId }, { enrolledClasses: classId }];
    if (search) {
        const pattern = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$and = [{ $or: [{ firstName: pattern }, { lastName: pattern }, { studentId: pattern }] }];
    }
    const students = await Student.find(filter)
        .select('firstName lastName studentId currentClass')
        .sort({ firstName: 1, lastName: 1 })
        .limit(500)
        .lean();
    const wallets = await TutorWallet.find({ school: schoolId, student: { $in: students.map((row) => row._id) } }).lean();
    const walletBy = new Map(wallets.map((row) => [String(row.student), row]));
    return students.map((student) => ({
        id: String(student._id),
        name: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        studentId: student.studentId || '',
        classId: String(student.currentClass || ''),
        wallet: walletShape(walletBy.get(String(student._id)))
    }));
};

export const studentsInClass = async ({ schoolId, classId }) => {
    const students = await Student.find({ school: schoolId, $or: [{ currentClass: classId }, { enrolledClasses: classId }] })
        .select('_id')
        .lean();
    return students.map((row) => row._id);
};

export const importLessons = async ({ schoolId, userId, subjectId, grade, lessons, source = '' }) => {
    const subject = objectId(subjectId);
    if (!subject) throw badRequest('Pick the subject before importing lessons.');
    const subjectDoc = await Subject.findOne({ _id: subject, school: schoolId }).select('name').lean();
    if (!subjectDoc) throw notFound('Subject not found.');
    const rows = validateLessonImport({ lessons, subjectId: subject, grade });

    const codes = [...new Set(rows.flatMap((row) => row.standards))];
    if (codes.length) {
        const known = await Standard.find({ school: schoolId, subject, gradeLevel: Number(grade) })
            .select('code')
            .lean();
        const knownCodes = new Set(known.map((row) => String(row.code || '').toUpperCase()));
        const missing = codes.filter((code) => !knownCodes.has(code));
        if (missing.length) {
            throw badRequest(
                `These standards are not in ${subjectDoc.name} for grade ${grade}: ${missing.slice(0, 6).join(', ')}`
                + `${missing.length > 6 ? ` and ${missing.length - 6} more` : ''}. Add them on the Standards page or remove them from the file.`
            );
        }
    }

    const gradeNumber = Number(grade);
    for (const row of rows) {
        const searchText = `${row.title} ${row.unitTitle} ${row.chapterTitle} ${(row.keywords || []).join(' ')} `
            + `${row.content.slice(0, 600)}`.toLowerCase();
        await TutorLesson.findOneAndUpdate(
            {
                school: schoolId,
                subject,
                grade: gradeNumber,
                unitNumber: row.unitNumber,
                chapterNumber: row.chapterNumber,
                lessonNumber: row.lessonNumber
            },
            {
                $set: {
                    ...row,
                    searchText,
                    wordCount: words(row.content).length,
                    source: String(source || '').slice(0, 200),
                    isActive: true,
                    createdBy: userId
                },
                $setOnInsert: { school: schoolId, subject, grade: gradeNumber }
            },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
    }

    return {
        imported: rows.length,
        subject: subjectDoc.name,
        grade: gradeNumber,
        units: new Set(rows.map((row) => row.unitNumber ?? '-')).size
    };
};

export const listAdminLessons = async ({ schoolId, subjectId, grade }) => {
    const filter = { school: schoolId, isActive: true };
    if (subjectId) filter.subject = subjectId;
    if (grade) filter.grade = Number(grade);
    const lessons = await TutorLesson.find(filter)
        .select(`${LESSON_LIST_FIELDS} wordCount source grade subject createdAt`)
        .sort({ grade: 1, unitNumber: 1, chapterNumber: 1, lessonNumber: 1 })
        .limit(400)
        .lean();
    const subjectIds = [...new Set(lessons.map((row) => String(row.subject)))];
    const subjects = subjectIds.length
        ? await Subject.find({ school: schoolId, _id: { $in: subjectIds } }).select('name').lean()
        : [];
    const subjectNameById = new Map(subjects.map((row) => [String(row._id), row.name]));
    return lessons.map((lesson) => ({
        id: String(lesson._id),
        subjectId: String(lesson.subject),
        subject: subjectNameById.get(String(lesson.subject)) || '',
        grade: lesson.grade,
        lessonNumber: lesson.lessonNumber,
        title: lesson.title,
        unitNumber: lesson.unitNumber,
        unitTitle: lesson.unitTitle,
        chapterNumber: lesson.chapterNumber,
        chapterTitle: lesson.chapterTitle,
        standards: lesson.standards || [],
        words: Number(lesson.wordCount) || 0
    }));
};

export const removeLesson = async ({ schoolId, lessonId }) => {
    const lesson = await TutorLesson.findOneAndUpdate(
        { school: schoolId, _id: lessonId },
        { $set: { isActive: false } },
        { new: true }
    ).lean();
    if (!lesson) throw notFound('Lesson not found.');
    return { id: String(lesson._id), isActive: false };
};

export const getWalletForStudent = async ({ schoolId, student }) => {
    const wallet = await ensureWallet({ schoolId, student });
    return walletShape(wallet);
};
