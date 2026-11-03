import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import * as tutorService from '../services/tutorService.js';
import * as voiceTutorService from '../services/voiceTutorService.js';

const isAdminUser = (user) => ['admin', 'super_admin'].includes(String(user?.role || ''));

/**
 * The signed-in student. A student may have one row per academic year, so the
 * current year wins and the newest row is the fallback.
 */
const studentForRequest = async (req) => {
    const academicYear = resolveAcademicYearForRequest(req);
    const student = await Student.findOne({ school: req.schoolId, user: req.user._id, academicYear })
        .select('_id user currentClass enrolledClasses academicYear firstName lastName')
        .lean();
    if (student) return student;
    const fallback = await Student.findOne({ school: req.schoolId, user: req.user._id })
        .select('_id user currentClass enrolledClasses academicYear firstName lastName')
        .sort({ createdAt: -1 })
        .lean();
    if (!fallback) {
        throw Object.assign(new Error('This sign-in has no student record, so there is no tutor to open.'), { statusCode: 404 });
    }
    return fallback;
};

const languageOf = (value) => (String(value || '').slice(0, 2).toLowerCase() === 'ar' ? 'ar' : 'en');

/** The lazy flag is a text part next to the audio file, or a plain JSON field. */
const lazyAudio = (body) => String(body?.audio || body?.audioMode || '').toLowerCase() === 'lazy';

/** One timing line per turn, plus the same numbers in the response header. */
const timedVoiceCall = async (req, res, run) => {
    const timing = voiceTutorService.createTurnTiming();
    let data;
    try {
        data = await run(timing);
    } catch (error) {
        voiceTutorService.logVoiceTurnTiming({ schoolId: req.schoolId, timing });
        throw error;
    }
    const body = { success: true, data };
    voiceTutorService.logVoiceTurnTiming({
        schoolId: req.schoolId,
        timing,
        responseBytes: Buffer.byteLength(JSON.stringify(body))
    });
    const header = voiceTutorService.serverTimingHeader(timing);
    if (header) res.set('Server-Timing', header);
    return body;
};

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

export const myTutorHome = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await tutorService.getStudentTutorHome({
        schoolId: req.schoolId,
        student,
        subjectId: req.query.subjectId || null
    });
    res.json({ success: true, data });
});

export const myTutorHistory = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await tutorService.getStudentHistory({
        schoolId: req.schoolId,
        student,
        subjectId: req.query.subjectId || null
    });
    res.json({ success: true, data });
});

export const askTutor = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await tutorService.askTutor({
        schoolId: req.schoolId,
        student,
        subjectId: req.body?.subjectId,
        lessonId: req.body?.lessonId || null,
        question: req.body?.question,
        language: languageOf(req.body?.language)
    });
    res.status(201).json({ success: true, data });
});

/* Premium voice tutor: the picker, the session and one spoken turn. */

export const myVoiceHome = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await voiceTutorService.getVoiceHome({
        schoolId: req.schoolId,
        student,
        subjectId: req.query.subjectId || null
    });
    res.json({ success: true, data });
});

export const startVoiceSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const body = await timedVoiceCall(req, res, (timing) => voiceTutorService.startVoiceSession({
        schoolId: req.schoolId,
        student,
        subjectId: req.body?.subjectId,
        lessonId: req.body?.lessonId,
        language: req.body?.language,
        lazy: lazyAudio(req.body),
        timing
    }));
    res.status(201).json(body);
});

export const getVoiceSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await voiceTutorService.getVoiceSession({
        schoolId: req.schoolId,
        student,
        sessionId: req.params.sessionId
    });
    res.json({ success: true, data });
});

export const voiceTurn = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const body = await timedVoiceCall(req, res, (timing) => voiceTutorService.askVoice({
        schoolId: req.schoolId,
        student,
        sessionId: req.params.sessionId,
        audio: req.file?.buffer || null,
        mimeType: req.file?.mimetype || 'audio/webm',
        text: req.body?.text || '',
        durationMs: Number(req.body?.durationMs) || 0,
        lazy: lazyAudio(req.body),
        timing
    }));
    res.status(201).json(body);
});

export const voiceClip = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const clip = await voiceTutorService.getVoiceClip({
        schoolId: req.schoolId,
        student,
        sessionId: req.params.sessionId,
        turnId: req.params.turnId,
        clipIndex: req.params.clipIndex
    });
    res.set({
        'Content-Type': clip.contentType,
        'Content-Length': String(clip.buffer.length),
        'Cache-Control': 'private, max-age=3600'
    });
    res.end(clip.buffer);
});

export const endVoiceSession = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await voiceTutorService.endVoiceSession({
        schoolId: req.schoolId,
        student,
        sessionId: req.params.sessionId
    });
    res.json({ success: true, data });
});

export const createPractice = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await tutorService.generatePractice({
        schoolId: req.schoolId,
        student,
        subjectId: req.body?.subjectId,
        lessonId: req.body?.lessonId || null,
        language: languageOf(req.body?.language)
    });
    res.status(201).json({ success: true, data });
});

export const getPractice = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await tutorService.getPracticeSet({
        schoolId: req.schoolId,
        student,
        setId: req.params.practiceId
    });
    res.json({ success: true, data });
});

export const answerPractice = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const data = await tutorService.submitPractice({
        schoolId: req.schoolId,
        student,
        setId: req.params.practiceId,
        answers: req.body?.answers
    });
    res.json({ success: true, data });
});

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

export const teacherConversations = asyncHandler(async (req, res) => {
    const data = await tutorService.conversationsForTeacher({
        schoolId: req.schoolId,
        user: req.user,
        classId: req.query.classId || null,
        studentId: req.query.studentId || null
    });
    res.json({ success: true, data });
});

export const teacherConversation = asyncHandler(async (req, res) => {
    const data = await tutorService.conversationForTeacher({
        schoolId: req.schoolId,
        user: req.user,
        isAdmin: isAdminUser(req.user),
        conversationId: req.params.conversationId
    });
    res.json({ success: true, data });
});

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export const adminOverview = asyncHandler(async (req, res) => {
    const data = await tutorService.getAdminOverview({
        schoolId: req.schoolId,
        academicYear: resolveAcademicYearForRequest(req)
    });
    res.json({ success: true, data });
});

export const updateSettings = asyncHandler(async (req, res) => {
    const settings = await tutorService.saveTutorSettings({
        schoolId: req.schoolId,
        userId: req.user._id,
        patch: req.body || {}
    });
    res.json({ success: true, data: settings });
});

export const updateClassAccess = asyncHandler(async (req, res) => {
    const data = await tutorService.setClassAccess({
        schoolId: req.schoolId,
        classId: req.params.classId,
        userId: req.user._id,
        status: req.body?.status,
        note: req.body?.note
    });
    res.json({ success: true, data });
});

export const adminStudents = asyncHandler(async (req, res) => {
    const data = await tutorService.listAdminStudents({
        schoolId: req.schoolId,
        classId: req.query.classId || null,
        search: req.query.search || ''
    });
    res.json({ success: true, data });
});

/** Equal share: the same number of questions for every student in the class. */
export const distributeCredits = asyncHandler(async (req, res) => {
    if (!req.body?.classId) {
        throw Object.assign(new Error('Pick a class first.'), { statusCode: 400 });
    }
    const studentIds = await tutorService.studentsInClass({
        schoolId: req.schoolId,
        classId: req.body.classId
    });
    if (!studentIds.length) {
        throw Object.assign(new Error('This class has no students yet.'), { statusCode: 400 });
    }
    const rows = await tutorService.grantCredits({
        schoolId: req.schoolId,
        studentIds,
        credits: req.body?.credits,
        userId: req.user._id,
        note: req.body?.note || 'Equal share for the class'
    });
    res.json({ success: true, data: { students: rows.length, credits: rows } });
});

export const giveCredits = asyncHandler(async (req, res) => {
    const rows = await tutorService.grantCredits({
        schoolId: req.schoolId,
        studentIds: req.body?.studentIds,
        credits: req.body?.credits,
        userId: req.user._id,
        note: req.body?.note || ''
    });
    res.json({ success: true, data: { students: rows.length, credits: rows } });
});

export const pauseStudent = asyncHandler(async (req, res) => {
    const data = await tutorService.setWalletPaused({
        schoolId: req.schoolId,
        studentId: req.params.studentId,
        userId: req.user._id,
        paused: req.body?.paused
    });
    res.json({ success: true, data });
});

export const giveVoiceCredit = asyncHandler(async (req, res) => {
    const data = await voiceTutorService.giveVoiceCredit({
        schoolId: req.schoolId,
        studentIds: req.body?.studentIds,
        classId: req.body?.classId,
        credits: req.body?.credits,
        adminId: req.user._id
    });
    res.json({ success: true, data });
});

const takeBackError = (message) => Object.assign(new Error(message), { statusCode: 400 });

export const takeBackCredits = asyncHandler(async (req, res) => {
    const kind = req.body?.kind;
    if (kind !== 'questions' && kind !== 'voice') {
        throw takeBackError('Pick questions or voice credit to take back.');
    }
    let studentIds = req.body?.studentIds;
    if ((!Array.isArray(studentIds) || !studentIds.length) && req.body?.classId) {
        studentIds = await tutorService.studentsInClass({
            schoolId: req.schoolId,
            classId: req.body.classId
        });
        if (!studentIds.length) throw takeBackError('This class has no students yet.');
    }
    if (!Array.isArray(studentIds) || !studentIds.length) {
        throw takeBackError('Pick a class or at least one student.');
    }
    const all = req.body?.all === true;
    if (kind === 'voice') {
        const data = await voiceTutorService.takeBackVoiceCredit({
            schoolId: req.schoolId,
            studentIds,
            credits: req.body?.credits,
            all,
            adminId: req.user._id,
            note: req.body?.note || ''
        });
        res.json({ success: true, data });
        return;
    }
    const rows = await tutorService.takeBackCredits({
        schoolId: req.schoolId,
        studentIds,
        credits: req.body?.credits,
        all,
        userId: req.user._id,
        note: req.body?.note || ''
    });
    res.json({ success: true, data: { students: rows.length, credits: rows } });
});

export const studentCreditHistory = asyncHandler(async (req, res) => {
    const data = await tutorService.studentCreditHistory({
        schoolId: req.schoolId,
        studentId: req.params.studentId
    });
    res.json({ success: true, data });
});

export const setStudentLevel = asyncHandler(async (req, res) => {
    const data = await tutorService.setStudentLanguageLevel({
        schoolId: req.schoolId,
        studentId: req.params.studentId,
        level: req.body?.level
    });
    res.json({ success: true, data });
});

export const adminSubjects = asyncHandler(async (req, res) => {
    const data = await tutorService.subjectsForGrade({
        schoolId: req.schoolId,
        grade: req.query.grade
    });
    res.json({ success: true, data });
});

export const adminStandards = asyncHandler(async (req, res) => {
    const data = await tutorService.standardsForGrade({
        schoolId: req.schoolId,
        subjectId: req.query.subjectId,
        grade: req.query.grade
    });
    res.json({ success: true, data });
});

export const adminLessons = asyncHandler(async (req, res) => {
    const data = await tutorService.listAdminLessons({
        schoolId: req.schoolId,
        subjectId: req.query.subjectId || null,
        grade: req.query.grade || null
    });
    res.json({ success: true, data });
});

export const importLessons = asyncHandler(async (req, res) => {
    const data = await tutorService.importLessons({
        schoolId: req.schoolId,
        userId: req.user._id,
        subjectId: req.body?.subjectId,
        grade: req.body?.grade,
        lessons: req.body?.lessons,
        source: req.body?.source
    });
    res.status(201).json({ success: true, data });
});

export const removeLesson = asyncHandler(async (req, res) => {
    const data = await tutorService.removeLesson({
        schoolId: req.schoolId,
        lessonId: req.params.lessonId
    });
    res.json({ success: true, data });
});
