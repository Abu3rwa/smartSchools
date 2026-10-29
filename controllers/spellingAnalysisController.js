import { asyncHandler } from '../middleware/errorHandler.js';
import SpellingParentDraft from '../models/SpellingParentDraft.js';
import Student from '../models/Student.js';
import { getTeacherClassIds, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import * as service from '../services/spellingAnalysisService.js';

const languageOf = (value) => (value === 'ar' ? 'ar' : 'en');

const fail = (res, error) => {
    const statusCode = error?.statusCode || 500;
    return res.status(statusCode).json({
        success: false,
        message: statusCode >= 500 ? 'The spelling analysis could not be completed.' : error.message,
        ...(error?.code ? { code: error.code } : {})
    });
};

export const listAnalysisStudents = asyncHandler(async (req, res) => {
    try {
        const data = await service.listAnalysisStudents({
            schoolId: req.schoolId,
            grade: String(req.query.grade || '').toUpperCase(),
            window: req.query.window
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

export const getStudentAnalysis = asyncHandler(async (req, res) => {
    try {
        const data = await service.getStudentAnalysis({
            schoolId: req.schoolId,
            studentId: req.params.studentId,
            window: req.query.window
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

export const runStudentAnalysis = asyncHandler(async (req, res) => {
    try {
        const data = await service.runStudentAnalysis({
            schoolId: req.schoolId,
            studentId: req.params.studentId,
            window: req.body?.window,
            userId: req.user?._id,
            language: languageOf(req.body?.language),
            force: req.body?.force === true
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

export const getCohort = asyncHandler(async (req, res) => {
    if (!req.query.grade) {
        return res.status(400).json({
            success: false,
            message: 'Choose a grade before comparing students.',
            code: 'SPELLING_ANALYSIS_GRADE_REQUIRED'
        });
    }
    try {
        const data = await service.buildCohort({
            schoolId: req.schoolId,
            grade: String(req.query.grade).toUpperCase(),
            window: req.query.window
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

export const explainCohort = asyncHandler(async (req, res) => {
    if (!req.body?.grade) {
        return res.status(400).json({
            success: false,
            message: 'Choose a grade before comparing students.',
            code: 'SPELLING_ANALYSIS_GRADE_REQUIRED'
        });
    }
    try {
        const data = await service.explainCohort({
            schoolId: req.schoolId,
            grade: String(req.body.grade).toUpperCase(),
            window: req.body?.window,
            userId: req.user?._id,
            language: languageOf(req.body?.language)
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

export const createParentDraft = asyncHandler(async (req, res) => {
    try {
        const data = await service.createParentDraft({
            schoolId: req.schoolId,
            studentId: req.params.studentId,
            window: req.body?.window,
            language: languageOf(req.body?.language),
            userId: req.user?._id
        });
        return res.status(201).json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

export const updateParentDraft = asyncHandler(async (req, res) => {
    try {
        const data = await service.updateParentDraft({
            schoolId: req.schoolId,
            draftId: req.params.draftId,
            subject: req.body?.subject,
            body: req.body?.body
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});

/** Sending is manual by design: an admin or the student's own teacher presses it. */
export const sendParentDraft = asyncHandler(async (req, res) => {
    try {
        if (req.user?.role === 'teacher') {
            const draft = await SpellingParentDraft.findOne({ _id: req.params.draftId, school: req.schoolId })
                .select('student')
                .lean();
            if (!draft) {
                return res.status(404).json({ success: false, message: 'Draft not found', code: 'SPELLING_ANALYSIS_DRAFT_NOT_FOUND' });
            }
            const student = await Student.findOne({ _id: draft.student, school: req.schoolId })
                .select('currentClass')
                .lean();
            const teacher = await resolveTeacherProfile(req);
            const classIds = teacher ? await getTeacherClassIds(teacher._id) : [];
            const reachable = classIds.some((id) => String(id) === String(student?.currentClass || ''));
            if (!reachable) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only send to a student in your own class.',
                    code: 'SPELLING_ANALYSIS_CLASS_SCOPE'
                });
            }
        }
        const data = await service.sendParentDraft({
            schoolId: req.schoolId,
            draftId: req.params.draftId,
            userId: req.user?._id
        });
        return res.json({ success: true, data });
    } catch (error) {
        return fail(res, error);
    }
});
