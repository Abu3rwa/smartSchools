import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import SpellingSession from '../models/SpellingSession.js';
import SpellingClassSession from '../models/SpellingClassSession.js';
import SpellingWord from '../models/SpellingWord.js';
import Class from '../models/Class.js';
import { startSpellingClassSession } from '../services/spellingSessionService.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { validateSpellingIntegrityEvent } from '../utils/spellingIntegrity.js';
import {
    abandonSpellingSession,
    advanceClassWord,
    completeSpellingSession,
    getCurrentSpellingItem,
    markSpellingAttemptCorrect,
    recordSpellingAttempt,
    startSpellingSession
} from '../services/spellingSessionService.js';
import { attachAudioToCurrentItem } from '../services/wordAudioService.js';
import { listSpellingIntegrityEvents, recordSpellingIntegrityEvent } from '../services/spellingReadService.js';

export const createSpellingIntegrityEvent = asyncHandler(async (req, res) => {
    if (req.user?.role !== 'student') return res.status(403).json({ success: false, message: 'Student access required' });
    const { eventId, sequence, occurredAt } = validateSpellingIntegrityEvent(req.body);

    const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
    const result = await recordSpellingIntegrityEvent({
        schoolId: req.schoolId,
        studentId: student._id,
        sessionId: req.params.id,
        eventId,
        sequence,
        occurredAt
    });
    return res.json({ success: true, data: result });
});

export const getSpellingIntegrityEvents = asyncHandler(async (req, res) => {
    const session = await SpellingSession.findOne({ _id: req.params.id, school: req.schoolId }).select('student').lean();
    if (!session) return res.status(404).json({ success: false, message: 'Spelling session not found' });
    const student = await Student.findOne({ _id: session.student, school: req.schoolId }).select('currentClass enrolledClasses department').lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        const teacherClassIds = await getTeacherClassIds(teacher._id);
        const studentClassIds = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String);
        if (!teacherClassIds.some((classId) => studentClassIds.includes(String(classId)))) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this spelling session' });
        }
    } else if (req.user?.role === 'department_principal') {
        if (!req.departmentId) return res.status(403).json({ success: false, message: 'Department scope required' });
        const classes = await Class.find({ _id: { $in: [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean) }, school: req.schoolId }).select('department').lean();
        if (student.department?.toString() !== req.departmentId.toString() && !classes.some((classDoc) => classDoc.department?.toString() === req.departmentId.toString())) {
            return res.status(403).json({ success: false, message: 'Not authorized to view this spelling session' });
        }
    }

    const data = await listSpellingIntegrityEvents({ schoolId: req.schoolId, sessionId: req.params.id });
    return res.json({ success: true, data });
});

const resolveStudentId = async (req) => {
    if (req.user?.role === 'student') {
        const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
        return student?._id;
    }
    return req.body?.studentId;
};

export const startSession = asyncHandler(async (req, res) => {
    if (req.user?.role === 'student') {
        return res.status(403).json({ success: false, message: 'Only a teacher can start a spelling session' });
    }
    const studentId = await resolveStudentId(req);
    if (!studentId) return res.status(400).json({ success: false, message: 'studentId is required' });

    const maxMistakes = req.body.maxMistakesAllowed !== undefined && req.body.maxMistakesAllowed !== null
        ? Number(req.body.maxMistakesAllowed)
        : undefined;

    const session = await startSpellingSession({
        schoolId: req.schoolId,
        studentId,
        userId: req.user._id,
        mode: req.body.mode,
        maxMistakesAllowed: maxMistakes,
        retestDeadline: req.body.retestDeadline,
        curriculumGrade: req.body.curriculumGrade,
        curriculumWeek: req.body.curriculumWeek ? Number(req.body.curriculumWeek) : undefined,
        emailNotification: req.body.emailNotification ?? null,
        passageEmailAudience: req.body.passageEmailAudience ?? null,
        passageGeneration: req.body.passageGeneration || {}
    });
    return res.status(201).json({ success: true, data: session });
});

export const startClassSession = asyncHandler(async (req, res) => {
    const { classId, curriculumGrade } = req.body;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });

    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('_id department').lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });

    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
        if (!classIds.some((id) => String(id) === String(classId))) {
            return res.status(403).json({ success: false, message: 'Not authorized to start a spelling session for this class' });
        }
    } else if (req.user?.role === 'department_principal') {
        if (!req.departmentId || String(classDoc.department) !== String(req.departmentId)) {
            return res.status(403).json({ success: false, message: 'Not authorized to start a spelling session for this class' });
        }
    }

    const students = await Student.find({
        school: req.schoolId,
        $or: [{ currentClass: classId }, { enrolledClasses: classId }]
    }).select('_id').lean();
    const maxMistakes = req.body.maxMistakesAllowed !== undefined && req.body.maxMistakesAllowed !== null
        ? Number(req.body.maxMistakesAllowed)
        : undefined;
    const result = await startSpellingClassSession({
        schoolId: req.schoolId,
        classId,
        studentIds: students.map((student) => student._id),
        userId: req.user._id,
        mode: req.body.mode,
        maxMistakesAllowed: maxMistakes,
        retestDeadline: req.body.retestDeadline,
        curriculumGrade,
        emailNotification: req.body.emailNotification ?? null,
        passageEmailAudience: req.body.passageEmailAudience ?? null,
        passageGeneration: req.body.passageGeneration || {}
    });
    return res.status(201).json({ success: true, data: result });
});

export const getClassSessionProgress = asyncHandler(async (req, res) => {
    const { classId, grade } = req.query;
    if (!classId || !['KG', 'G1', 'G2', 'G3', 'G4', 'G5'].includes(grade)) {
        return res.status(400).json({ success: false, message: 'A valid classId and grade are required' });
    }

    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('_id department').lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });

    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
        if (!classIds.some((id) => String(id) === String(classId))) {
            return res.status(403).json({ success: false, message: 'Not authorized to view spelling progress for this class' });
        }
    } else if (req.user?.role === 'department_principal') {
        if (!req.departmentId || String(classDoc.department) !== String(req.departmentId)) {
            return res.status(403).json({ success: false, message: 'Not authorized to view spelling progress for this class' });
        }
    } else if (!['admin'].includes(req.user?.role)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view spelling progress for this class' });
    }

    const classSession = await SpellingClassSession.findOne({
        school: req.schoolId,
        class: classId,
        grade
    }).select('currentWord status').lean();
    const currentWord = classSession?.currentWord
        ? await SpellingWord.findOne({ _id: classSession.currentWord, school: req.schoolId }).select('week').lean()
        : await SpellingWord.findOne({ school: req.schoolId, grade }).sort({ week: 1, order: 1 }).select('week').lean();

    return res.json({
        success: true,
        data: {
            grade,
            week: currentWord?.week || null,
            status: classSession?.status || 'not-started'
        }
    });
});

export const getCurrentItem = asyncHandler(async (req, res) => {
    const result = await getCurrentSpellingItem({ schoolId: req.schoolId, sessionId: req.params.id });
    const data = await attachAudioToCurrentItem(result, req.schoolId);
    const handRaise = data?.session?.handRaise;
    if (data?.item && handRaise?.raisedAt && handRaise.sequence === data.item.sequence) {
        return res.status(200).json({ success: true, data: { ...data, item: { ...data.item, handRaised: true } } });
    }
    return res.status(200).json({ success: true, data });
});

export const raiseHand = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
    const sequence = Number(req.body?.sequence);
    if (!student || !Number.isInteger(sequence) || sequence < 1) {
        return res.status(400).json({ success: false, message: 'A valid sequence is required' });
    }
    const session = await SpellingSession.findOne({
        _id: req.params.id,
        school: req.schoolId,
        student: student._id,
        status: 'in-progress'
    });
    if (!session) return res.status(404).json({ success: false, message: 'Spelling session not found' });
    if (!(session.handRaise?.raisedAt && session.handRaise.sequence === sequence)) {
        session.handRaise = { raisedAt: new Date(), sequence };
        await session.save();
    }
    return res.json({ success: true, data: { raisedAt: session.handRaise.raisedAt, sequence } });
});

export const lowerHand = asyncHandler(async (req, res) => {
    const session = await SpellingSession.findOne({ _id: req.params.id, school: req.schoolId }).select('student');
    if (!session) return res.status(404).json({ success: false, message: 'Spelling session not found' });
    if (!(await canManageStudent(req, session.student))) {
        return res.status(403).json({ success: false, message: 'Not authorized for this student' });
    }
    await SpellingSession.updateOne(
        { _id: session._id, school: req.schoolId },
        { $set: { 'handRaise.raisedAt': null, 'handRaise.sequence': null } }
    );
    return res.json({ success: true });
});

const canManageStudent = async (req, studentId) => {
    if (req.user?.role === 'admin') return true;
    const student = await Student.findOne({ _id: studentId, school: req.schoolId }).select('currentClass enrolledClasses').lean();
    if (!student) return false;
    const studentClassIds = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String);
    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        const classIds = teacher ? (await getTeacherClassIds(teacher._id)).map(String) : [];
        return studentClassIds.some((id) => classIds.includes(id));
    }
    if (req.user?.role === 'department_principal') {
        const classes = await Class.find({ _id: { $in: studentClassIds }, school: req.schoolId, department: req.departmentId }).select('_id').lean();
        return Boolean(req.departmentId) && classes.length > 0;
    }
    return false;
};

export const listRaisedHands = asyncHandler(async (req, res) => {
    const { classId } = req.query;
    if (!classId) return res.status(400).json({ success: false, message: 'classId is required' });
    const classDoc = await Class.findOne({ _id: classId, school: req.schoolId }).select('_id department').lean();
    if (!classDoc) return res.status(404).json({ success: false, message: 'Class not found' });
    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
        if (!classIds.some((id) => String(id) === String(classId))) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
    } else if (req.user?.role === 'department_principal') {
        if (!req.departmentId || String(classDoc.department) !== String(req.departmentId)) {
            return res.status(403).json({ success: false, message: 'Not authorized for this class' });
        }
    }
    const students = await Student.find({
        school: req.schoolId,
        $or: [{ currentClass: classId }, { enrolledClasses: classId }]
    }).select('_id firstName lastName').lean();
    const byId = new Map(students.map((student) => [String(student._id), student]));
    const sessions = await SpellingSession.find({
        school: req.schoolId,
        student: { $in: students.map((student) => student._id) },
        status: 'in-progress',
        'handRaise.raisedAt': { $type: 'date' }
    }).select('student handRaise nextSequence currentItem').sort({ 'handRaise.raisedAt': 1 }).lean();
    const data = sessions
        .filter((session) => session.handRaise.sequence === (session.currentItem?.sequence ?? session.nextSequence))
        .map((session) => {
            const student = byId.get(String(session.student));
            return {
                sessionId: session._id,
                studentId: session.student,
                name: `${student?.firstName || ''} ${student?.lastName || ''}`.trim(),
                raisedAt: session.handRaise.raisedAt
            };
        });
    return res.json({ success: true, data });
});

export const advanceClassWordHandler = asyncHandler(async (req, res) => {
    const result = await advanceClassWord({
        schoolId: req.schoolId,
        sessionId: req.params.id,
        expectedWordId: req.body?.wordId
    });
    return res.status(200).json({ success: true, data: result });
});

export const recordAttempt = asyncHandler(async (req, res) => {
    const result = await recordSpellingAttempt({
        schoolId: req.schoolId,
        sessionId: req.params.id,
        userId: req.user._id,
        sequence: Number(req.body.sequence),
        correct: req.body.correct,
        studentInput: req.body.studentInput,
        skipped: req.body.skipped === true,
        idempotencyKey: req.body.idempotencyKey
    });
    return res.status(200).json({ success: true, data: result });
});

export const markAttemptCorrect = asyncHandler(async (req, res) => {
    const session = await SpellingSession.findOne({ _id: req.params.id, school: req.schoolId }).select('student').lean();
    if (!session) return res.status(404).json({ success: false, message: 'Spelling session not found' });

    const student = await Student.findOne({ _id: session.student, school: req.schoolId })
        .select('currentClass enrolledClasses department')
        .lean();
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });

    if (req.user?.role === 'teacher') {
        const teacher = await resolveTeacherProfile(req);
        if (!teacher) return res.status(403).json({ success: false, message: 'Teacher profile not found' });
        const teacherClassIds = await getTeacherClassIds(teacher._id);
        const studentClassIds = [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean).map(String);
        if (!teacherClassIds.some((classId) => studentClassIds.includes(String(classId)))) {
            return res.status(403).json({ success: false, message: 'Not authorized to correct this spelling attempt' });
        }
    } else if (req.user?.role === 'department_principal') {
        if (!req.departmentId) return res.status(403).json({ success: false, message: 'Department scope required' });
        const classes = await Class.find({
            _id: { $in: [student.currentClass, ...(student.enrolledClasses || [])].filter(Boolean) },
            school: req.schoolId
        }).select('department').lean();
        if (student.department?.toString() !== req.departmentId.toString()
            && !classes.some((classDoc) => classDoc.department?.toString() === req.departmentId.toString())) {
            return res.status(403).json({ success: false, message: 'Not authorized to correct this spelling attempt' });
        }
    }

    const result = await markSpellingAttemptCorrect({
        schoolId: req.schoolId,
        sessionId: req.params.id,
        attemptId: req.params.attemptId,
        userId: req.user._id
    });
    return res.status(200).json({ success: true, data: result });
});

export const completeSession = asyncHandler(async (req, res) => {
    const result = await completeSpellingSession({
        schoolId: req.schoolId,
        sessionId: req.params.id,
        reason: req.body?.reason
    });
    return res.status(200).json({ success: true, data: result });
});

export const abandonSession = asyncHandler(async (req, res) => {
    const session = await abandonSpellingSession({ schoolId: req.schoolId, sessionId: req.params.id });
    return res.status(200).json({ success: true, data: session });
});
