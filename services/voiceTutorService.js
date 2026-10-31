/**
 * The premium voice tutor. A session is one lesson and one board; every spoken
 * message costs a fixed number of student credits, while the ledger records the
 * real provider cost (tokens plus seconds of speech) so profit stays visible.
 */
import mongoose from 'mongoose';

import TutorVoiceSession from '../models/TutorVoiceSession.js';
import TutorLesson from '../models/TutorLesson.js';
import TutorWallet from '../models/TutorWallet.js';
import Subject from '../models/Subject.js';
import Student from '../models/Student.js';
import AiCreditAccount from '../models/AiCreditAccount.js';

import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';
import { allocateCredit, chargeUsage, tokenCounts } from './aiCreditService.js';
import {
    countTries,
    buildVoicePrompt,
    buildVoiceOpeningPrompt,
    lessonLabel,
    readVoiceReply,
    resolveAccess
} from './tutorCore.js';
import {
    getClassAccess,
    getStudentTutorHome,
    getTutorSettings,
    pickLessons,
    standardsForGrade,
    studentLanguageLevel,
    studentScope
} from './tutorService.js';
import { getVoiceConfig } from './voiceTutorConfig.js';
import { voiceCostCents } from './voiceTutorPricing.js';
import { estimateSpeechSeconds, synthesizeSpeech, transcribeAudio } from './voiceSpeech.js';

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const notFound = (message) => Object.assign(new Error(message), { statusCode: 404 });
const forbidden = (message, code) => Object.assign(new Error(message), { statusCode: 403, code });
const paymentRequired = (message, code = 'VOICE_TUTOR_NO_CREDIT') =>
    Object.assign(new Error(message), { statusCode: 402, code });

const MAX_SESSION_MESSAGES = 60;
const MAX_TRANSCRIPT_CHARS = 1000;

const objectId = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null);
const creditsOf = (account) => Math.max(0, Math.floor(Number(account?.balanceCents) || 0));

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

export const voiceWallet = async ({ schoolId, user }) => {
    const account = await AiCreditAccount.findOne({ school: schoolId, user })
        .select('balanceCents paused')
        .lean();
    return {
        credits: creditsOf(account),
        paused: Boolean(account?.paused),
        exists: Boolean(account)
    };
};

const walletCopy = (wallet, price) => ({
    credits: wallet.credits,
    price,
    canAsk: wallet.credits >= price,
    paused: wallet.paused,
    notice: wallet.credits < price ? 'empty' : wallet.credits - price < price ? 'last' : 'ok'
});

/** The school switch, the class switch and the student's own balance, in that order. */
const assertVoiceAccess = async ({ schoolId, student, config, needCredit = true }) => {
    if (!student?.user) {
        throw paymentRequired('The voice tutor needs a student account with credit. Ask the school office.');
    }
    const settings = await getTutorSettings(schoolId);
    const classAccess = await getClassAccess(schoolId, student.currentClass);
    const [wallet, tutorWallet] = await Promise.all([
        voiceWallet({ schoolId, user: student.user }),
        // The tutor pause switch stops voice too; it is one tutor, two modes.
        TutorWallet.findOne({ school: schoolId, student: student._id }).select('paused').lean()
    ]);
    const decision = resolveAccess({
        settings,
        classAccess,
        walletPaid: wallet.paused || Boolean(tutorWallet?.paused)
    });
    if (!decision.allowed) {
        const copy = {
            school_off: ['The AI tutor is turned off for your school right now.', 'TUTOR_SCHOOL_OFF'],
            class_locked: ['The AI tutor is not available for your class.', 'TUTOR_CLASS_LOCKED'],
            class_paused: ['The AI tutor is paused for your class right now.', 'TUTOR_CLASS_PAUSED'],
            wallet_paused: ['Your voice tutor is paused. Ask your teacher or the school office.', 'TUTOR_STUDENT_PAUSED']
        }[decision.reason] || ['The AI tutor is not available right now.', 'TUTOR_UNAVAILABLE'];
        throw forbidden(copy[0], copy[1]);
    }
    if (needCredit && wallet.credits < config.messageCredits) {
        throw paymentRequired(
            `Each voice message costs ${config.messageCredits} credits, and you have ${wallet.credits}. Ask your teacher or the school office for more.`
        );
    }
    return wallet;
};

/* ------------------------------------------------------------------ */
/* Funding                                                             */
/* ------------------------------------------------------------------ */

const MAX_VOICE_GRANT = 100000;

/**
 * Moves reserve credit from the school pool into student balances. One credit is
 * one cent, so an admin can see exactly what a message costs. Nothing is
 * created: the pool must already hold the money.
 */
export const giveVoiceCredit = async ({
    schoolId,
    studentIds = [],
    classId = null,
    credits,
    adminId
}) => {
    const amountCents = Number(credits);
    if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > MAX_VOICE_GRANT) {
        throw badRequest(`Enter a whole number of voice credits from 1 to ${MAX_VOICE_GRANT}.`);
    }
    const filter = { school: schoolId, user: { $ne: null } };
    if (Array.isArray(studentIds) && studentIds.length) {
        const ids = studentIds.map(objectId).filter(Boolean);
        if (!ids.length) throw badRequest('Pick at least one student.');
        filter._id = { $in: ids };
    } else if (objectId(classId)) {
        filter.$or = [{ currentClass: classId }, { enrolledClasses: classId }];
    } else {
        throw badRequest('Pick a class or at least one student.');
    }

    const students = await Student.find(filter).select('_id user').lean();
    if (!students.length) throw badRequest('No students with a sign-in were found for this choice.');

    const rows = [];
    let shortPool = false;
    for (const student of students) {
        try {
            const { account } = await allocateCredit({
                schoolId,
                userId: student.user,
                amountCents,
                note: 'Voice tutor',
                adminId
            });
            rows.push({ studentId: String(student._id), voiceCredits: creditsOf(account) });
        } catch (error) {
            if (error?.code === 'AI_CREDIT_RESERVE_SHORT') {
                shortPool = true;
                break;
            }
            throw error;
        }
    }
    if (!rows.length) {
        throw Object.assign(
            new Error('The school reserve does not have enough credit. Ask the platform owner to top up the school.'),
            { statusCode: 409, code: 'AI_CREDIT_RESERVE_SHORT' }
        );
    }
    return { credits: amountCents, students: rows.length, rows, shortPool };
};

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

/** Pricing failure is an ops problem: log the reason, tell the student something usable. */
const voiceConfig = async (schoolId) => {
    try {
        return await getVoiceConfig();
    } catch (error) {
        logger.warn('voice_tutor_config_failed', { schoolId: String(schoolId), error: error?.message });
        throw Object.assign(
            new Error('The voice tutor is not set up yet. Ask your teacher or the school office.'),
            { statusCode: 422, code: 'VOICE_NOT_CONFIGURED' }
        );
    }
};

/** The picker: the same subjects and lessons as the text tutor, plus the voice wallet. */
export const getVoiceHome = async ({ schoolId, student, subjectId = null }) => {
    const home = await getStudentTutorHome({ schoolId, student, subjectId });
    let config = null;
    let problem = '';
    try {
        config = await voiceConfig(schoolId);
    } catch (error) {
        problem = error.message;
    }
    const wallet = await voiceWallet({ schoolId, user: student?.user });
    return {
        ...home,
        voice: {
            ready: Boolean(config) && home.access.allowed,
            problem,
            price: config?.messageCredits ?? 0,
            listenSeconds: config?.maxTranscriptSeconds ?? 30,
            wallet: config ? walletCopy(wallet, config.messageCredits) : null
        }
    };
};

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

const publicMessage = (message = {}) => ({
    role: message.role,
    text: message.text || '',
    spoken: message.spoken || '',
    lead: message.lead || '',
    emphasis: message.emphasis || '',
    blocks: Array.isArray(message.blocks) ? message.blocks : [],
    points: Array.isArray(message.points) ? message.points : [],
    followUp: message.followUp || '',
    stage: message.stage || '',
    at: message.at || null
});

const shapeSession = (session, wallet, config) => ({
    id: String(session._id),
    status: session.status,
    grade: session.grade,
    language: session.language || 'en',
    languageLevel: session.languageLevel,
    subject: session.subject ? { id: String(session.subject), name: session.subjectName || '' } : null,
    lesson: session.lesson ? { id: String(session.lesson), label: session.lessonLabel || '' } : null,
    messages: (session.messages || []).map(publicMessage),
    messageCount: session.messageCount || 0,
    creditsSpent: session.creditsSpent || 0,
    voice: walletCopy(wallet, config.messageCredits),
    pricing: {
        price: config.messageCredits,
        creditCents: config.creditCents,
        ttsVoice: config.ttsVoice
    }
});

const findSession = async ({ schoolId, student, sessionId }) => {
    const id = objectId(sessionId);
    if (!id) throw notFound('Session not found.');
    const session = await TutorVoiceSession.findOne({ _id: id, school: schoolId, student: student._id });
    if (!session) throw notFound('This voice session is not yours.');
    return session;
};

const openingTurn = (lessonTitle, language = 'en') => {
    const arabic = language === 'ar';
    const lead = arabic ? `لنتحدّث عن ${lessonTitle}.` : `Let's talk about ${lessonTitle}.`;
    const followUp = arabic ? 'قل لي ما تعرفه عنه بالفعل.' : 'Tell me what you already know about it.';
    const spoken = arabic
        ? `${lead} قل لي ما تعرفه، وسنكتشف الباقي معًا.`
        : `${lead} Tell me what you already know, and we'll work the rest out together.`;
    return {
        role: 'tutor',
        text: `${lead} ${followUp}`,
        spoken,
        lead,
        emphasis: '',
        blocks: [],
        followUp,
        stage: 'prompt',
        credits: 0,
        at: new Date()
    };
};

export const startVoiceSession = async ({ schoolId, student, subjectId, lessonId, language = 'en' }) => {
    const config = await voiceConfig(schoolId);
    const wallet = await assertVoiceAccess({ schoolId, student, config });

    const subject = objectId(subjectId);
    if (!subject) throw badRequest('Pick the subject you want to talk about first.');
    const subjectDoc = await Subject.findOne({ _id: subject, school: schoolId }).select('name').lean();
    if (!subjectDoc) throw notFound('Subject not found.');

    const { grade, classDoc } = await studentScope({ schoolId, student });
    const lesson = objectId(lessonId)
        ? await TutorLesson.findOne({ _id: lessonId, school: schoolId, subject, grade, isActive: true })
            .select('unitNumber unitTitle chapterNumber chapterTitle lessonNumber title content standards').lean()
        : null;
    if (!lesson) throw badRequest('Pick a lesson before you start a voice session.');

    const languageLevel = await studentLanguageLevel({ schoolId, student, grade });
    const sessionLanguage = String(language).slice(0, 2).toLowerCase() === 'ar' ? 'ar' : 'en';

    // The opening is generated from this lesson and the student's level, then
    // spoken. If the model or the voice fails, a plain opening still opens the
    // board so a session never starts on silence and an empty screen.
    const standards = await standardsForGrade({ schoolId, subjectId: subject, grade, limit: 15 });
    let opening = null;
    let openingReply = null;
    try {
        const prompt = buildVoiceOpeningPrompt({
            lessons: [lesson],
            standards,
            subjectName: subjectDoc.name,
            grade,
            language: sessionLanguage,
            languageLevel,
            lesson
        });
        openingReply = await connectAi(prompt, { usage: false, provider: 'openai', modelName: config.model });
        opening = readVoiceReply(openingReply?.text);
    } catch (error) {
        logger.warn('voice_tutor_opening_failed', { schoolId: String(schoolId), error: error?.message });
    }

    const message = opening
        ? {
            role: 'tutor',
            text: opening.spoken,
            spoken: opening.spoken,
            lead: opening.lead,
            emphasis: opening.emphasis,
            blocks: opening.blocks,
            followUp: opening.followUp,
            stage: 'opening',
            lessonIds: [lesson._id],
            tokens: Number(openingReply?.totalTokenCount) || 0,
            credits: 0,
            at: new Date()
        }
        : openingTurn(lesson.title, sessionLanguage);

    const speechSeconds = Math.min(config.maxSpeechSeconds, estimateSpeechSeconds(message.spoken));
    let speech = null;
    let audioFailed = false;
    try {
        speech = await synthesizeSpeech({ text: message.spoken, model: config.ttsModel, voice: config.ttsVoice });
    } catch (error) {
        audioFailed = true;
        logger.warn('voice_tutor_opening_tts_failed', { schoolId: String(schoolId), error: error?.message });
    }
    message.speechSeconds = speech ? speechSeconds : 0;

    // The opening is free to the student, but its real provider cost still lands
    // on the ledger so the school sees what the warm-up costs.
    let providerCostCents = 0;
    if (openingReply) {
        const tokens = tokenCounts(openingReply);
        const tokenCostCents = voiceCostCents({ tokens, modelRates: config.meters.modelRates });
        providerCostCents = voiceCostCents({
            tokens,
            speechSeconds: message.speechSeconds,
            modelRates: config.meters.modelRates,
            ttsCentsPerMinute: config.meters.ttsCentsPerMinute
        });
        await chargeUsage({
            schoolId,
            userId: student.user,
            reply: openingReply,
            feature: 'voice-tutor-opening',
            outcome: 'done',
            rates: config.meters.modelRates,
            extraCostCents: Math.max(0, providerCostCents - tokenCostCents),
            chargedCents: 0,
            audio: {
                transcriptSeconds: 0,
                speechSeconds: message.speechSeconds,
                sttModel: config.sttModel,
                ttsModel: config.ttsModel
            },
            refs: { student: student._id }
        });
    }

    const session = await TutorVoiceSession.create({
        school: schoolId,
        student: student._id,
        user: student.user,
        subject,
        subjectName: subjectDoc.name,
        lesson: lesson._id,
        lessonLabel: lessonLabel(lesson),
        classId: classDoc?._id,
        grade,
        language: sessionLanguage,
        languageLevel,
        messages: [message],
        messageCount: 1,
        providerCostCents,
        chargedCents: 0,
        profitCents: -providerCostCents
    });
    const shaped = shapeSession(session.toObject(), wallet, config);
    return {
        ...shaped,
        subject: { id: String(subject), name: subjectDoc.name },
        lesson: { id: String(lesson._id), label: lessonLabel(lesson) },
        audio: speech ? `data:${speech.contentType};base64,${speech.buffer.toString('base64')}` : null,
        audioFailed
    };
};

export const getVoiceSession = async ({ schoolId, student, sessionId }) => {
    const config = await voiceConfig(schoolId);
    const wallet = await voiceWallet({ schoolId, user: student.user });
    const session = await findSession({ schoolId, student, sessionId });
    const shaped = shapeSession(session.toObject(), wallet, config);
    if (session.lesson) {
        const lesson = await TutorLesson.findOne({ _id: session.lesson, school: schoolId })
            .select('unitNumber unitTitle chapterNumber chapterTitle lessonNumber title').lean();
        if (lesson) shaped.lesson = { id: String(lesson._id), label: lessonLabel(lesson) };
    }
    if (session.subject) {
        const subject = await Subject.findOne({ _id: session.subject, school: schoolId }).select('name').lean();
        if (subject) shaped.subject = { id: String(session.subject), name: subject.name };
    }
    return shaped;
};

export const endVoiceSession = async ({ schoolId, student, sessionId }) => {
    const session = await findSession({ schoolId, student, sessionId });
    if (session.status !== 'ended') {
        session.status = 'ended';
        session.endedAt = new Date();
        await session.save();
    }
    return { id: String(session._id), status: session.status };
};

/* ------------------------------------------------------------------ */
/* One spoken turn                                                     */
/* ------------------------------------------------------------------ */

/**
 * Audio in, spoken turn out. Nothing is charged until a usable turn exists, so a
 * failed transcription or a tongue-tied model costs the student nothing.
 */
export const askVoice = async ({
    schoolId,
    student,
    sessionId,
    audio = null,
    mimeType = 'audio/webm',
    text = '',
    durationMs = 0
}) => {
    const session = await findSession({ schoolId, student, sessionId });
    if (session.status !== 'active') throw badRequest('This voice session has ended. Start a new lesson to keep talking.');

    const config = await voiceConfig(schoolId);
    await assertVoiceAccess({ schoolId, student, config });

    let transcript = String(text || '').trim().slice(0, MAX_TRANSCRIPT_CHARS);
    let transcriptSeconds = 0;
    if (!transcript) {
        const audioResult = await transcribeAudio({
            buffer: audio,
            mimeType,
            model: config.sttModel,
            language: session.language || 'en'
        });
        transcript = audioResult.text.slice(0, MAX_TRANSCRIPT_CHARS);
        transcriptSeconds = Math.max(0, Math.min(config.maxTranscriptSeconds, Number(durationMs) / 1000 || 0));
    }
    if (!transcript) throw badRequest('Say something first, then send it.');

    const [subjectDoc, lessonRow] = await Promise.all([
        Subject.findOne({ _id: session.subject, school: schoolId }).select('name').lean(),
        TutorLesson.findOne({ _id: session.lesson, school: schoolId })
            .select('unitNumber unitTitle chapterNumber chapterTitle lessonNumber title').lean()
    ]);
    const lessons = await pickLessons({
        schoolId,
        subjectId: session.subject,
        grade: session.grade,
        question: transcript,
        lessonId: session.lesson
    });
    if (!lessons.length) throw badRequest('This lesson is no longer available. Ask your teacher to check it.');

    const standards = await standardsForGrade({
        schoolId,
        subjectId: session.subject,
        grade: session.grade,
        limit: 15
    });
    const prior = (session.messages || []).map((message) => ({
        role: message.role,
        text: message.text,
        spoken: message.spoken,
        stage: message.stage || null
    }));
    const prompt = buildVoicePrompt({
        transcript,
        lessons,
        standards,
        subjectName: subjectDoc?.name || 'this subject',
        grade: session.grade,
        language: session.language,
        languageLevel: session.languageLevel,
        lesson: lessonRow,
        board: prior,
        tries: countTries(prior)
    });

    let reply;
    try {
        reply = await connectAi(prompt, {
            usage: false,
            provider: 'openai',
            modelName: config.model
        });
    } catch (error) {
        logger.warn('voice_tutor_ai_failed', { schoolId: String(schoolId), error: error?.message });
        throw Object.assign(new Error('The tutor could not answer just now. Nothing was charged — try again.'), {
            statusCode: 502,
            code: 'VOICE_TUTOR_AI_FAILED'
        });
    }

    const parsed = readVoiceReply(reply?.text);
    if (!parsed) {
        logger.warn('voice_tutor_reply_unusable', { schoolId: String(schoolId) });
        throw Object.assign(new Error('The tutor got tongue-tied. Nothing was charged — try again.'), {
            statusCode: 502,
            code: 'VOICE_TUTOR_EMPTY'
        });
    }

    const speechSeconds = Math.min(config.maxSpeechSeconds, estimateSpeechSeconds(parsed.spoken));
    let speech = null;
    let audioFailed = false;
    try {
        speech = await synthesizeSpeech({
            text: parsed.spoken,
            model: config.ttsModel,
            voice: config.ttsVoice
        });
    } catch (error) {
        // The words are still valid; the board shows them even when the voice fails.
        audioFailed = true;
        logger.warn('voice_tutor_tts_failed', { schoolId: String(schoolId), error: error?.message });
    }

    const billedSpeechSeconds = speech ? speechSeconds : 0;
    const tokens = tokenCounts(reply);
    const tokenCostCents = voiceCostCents({
        tokens,
        modelRates: config.meters.modelRates
    });
    const providerCostCents = voiceCostCents({
        tokens,
        transcriptSeconds,
        speechSeconds: billedSpeechSeconds,
        modelRates: config.meters.modelRates,
        sttCentsPerMinute: config.meters.sttCentsPerMinute,
        ttsCentsPerMinute: config.meters.ttsCentsPerMinute
    });
    const price = config.messageCredits;

    await chargeUsage({
        schoolId,
        userId: student.user,
        reply,
        feature: 'voice-tutor',
        outcome: 'done',
        rates: config.meters.modelRates,
        extraCostCents: Math.max(0, providerCostCents - tokenCostCents),
        chargedCents: price,
        audio: {
            transcriptSeconds,
            speechSeconds: billedSpeechSeconds,
            sttModel: config.sttModel,
            ttsModel: config.ttsModel
        },
        refs: { student: student._id }
    });

    session.messages.push(
        {
            role: 'student',
            text: transcript,
            transcriptSeconds,
            at: new Date()
        },
        {
            role: 'tutor',
            text: parsed.spoken,
            spoken: parsed.spoken,
            lead: parsed.lead,
            emphasis: parsed.emphasis,
            blocks: parsed.blocks,
            followUp: parsed.followUp,
            stage: parsed.stage,
            lessonIds: lessons.map((lesson) => lesson._id),
            tokens: Number(reply?.totalTokenCount) || 0,
            credits: price,
            speechSeconds: billedSpeechSeconds,
            at: new Date()
        }
    );
    if (session.messages.length > MAX_SESSION_MESSAGES) {
        session.messages.splice(0, session.messages.length - MAX_SESSION_MESSAGES);
    }
    session.messageCount = (session.messageCount || 0) + 1;
    session.creditsSpent = (session.creditsSpent || 0) + price;
    session.providerCostCents = (session.providerCostCents || 0) + providerCostCents;
    session.chargedCents = (session.chargedCents || 0) + price;
    session.profitCents = (session.profitCents || 0) + (price - providerCostCents);
    await session.save();

    const after = await voiceWallet({ schoolId, user: student.user });
    return {
        sessionId: String(session._id),
        transcript,
        stage: parsed.stage,
        lead: parsed.lead,
        emphasis: parsed.emphasis,
        blocks: parsed.blocks,
        followUp: parsed.followUp,
        spoken: parsed.spoken,
        lesson: lessonRow ? { id: String(lessonRow._id), label: lessonLabel(lessonRow) } : null,
        audio: speech ? `data:${speech.contentType};base64,${speech.buffer.toString('base64')}` : null,
        audioFailed,
        voice: walletCopy(after, price)
    };
};
