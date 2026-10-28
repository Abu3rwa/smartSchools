import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import { resolveAcademicYearForRequest } from '../helpers/academicYearScope.js';
import * as writingService from '../services/writingAssistantService.js';

const studentForRequest = async (req) => {
    const academicYear = resolveAcademicYearForRequest(req);
    const student = await Student.findOne({
        school: req.schoolId,
        user: req.user._id,
        academicYear
    }).select('_id currentClass').lean();
    if (!student) {
        throw Object.assign(new Error(`No student record for this sign-in in ${academicYear}`), { statusCode: 404 });
    }
    return student;
};

const isAdminUser = (user) => ['admin', 'super_admin'].includes(String(user?.role || ''));

/* ------------------------------------------------------------------ */
/* Teacher                                                             */
/* ------------------------------------------------------------------ */

export const createAssignment = asyncHandler(async (req, res) => {
    const assignment = await writingService.createAssignment({
        schoolId: req.schoolId,
        academicYear: resolveAcademicYearForRequest(req),
        userId: req.user._id,
        payload: req.body || {}
    });
    res.status(201).json({ success: true, data: assignment });
});

export const listAssignments = asyncHandler(async (req, res) => {
    const assignments = await writingService.listAssignments({
        schoolId: req.schoolId,
        userId: req.user._id,
        isAdmin: isAdminUser(req.user),
        classId: req.query.classId,
        academicYear: resolveAcademicYearForRequest(req),
        search: req.query.search
    });
    res.json({ success: true, data: assignments });
});

export const getAssignment = asyncHandler(async (req, res) => {
    const assignment = await writingService.getAssignment({
        schoolId: req.schoolId,
        assignmentId: req.params.assignmentId
    });
    res.json({ success: true, data: assignment });
});

export const updateAssignment = asyncHandler(async (req, res) => {
    const assignment = await writingService.updateAssignment({
        schoolId: req.schoolId,
        assignmentId: req.params.assignmentId,
        userId: req.user._id,
        isAdmin: isAdminUser(req.user),
        payload: req.body || {}
    });
    res.json({ success: true, data: assignment });
});

export const deactivateAssignment = asyncHandler(async (req, res) => {
    const result = await writingService.deactivateAssignment({
        schoolId: req.schoolId,
        assignmentId: req.params.assignmentId,
        userId: req.user._id,
        isAdmin: isAdminUser(req.user)
    });
    res.json({ success: true, data: result });
});

export const saveAsTemplate = asyncHandler(async (req, res) => {
    const template = await writingService.saveAsTemplate({
        schoolId: req.schoolId,
        assignmentId: req.params.assignmentId,
        userId: req.user._id,
        isAdmin: isAdminUser(req.user)
    });
    res.status(201).json({ success: true, data: template });
});

export const listTemplates = asyncHandler(async (req, res) => {
    const templates = await writingService.listAssignments({
        schoolId: req.schoolId,
        userId: req.user._id,
        isAdmin: isAdminUser(req.user),
        includeTemplates: true
    });
    res.json({ success: true, data: templates.filter((row) => row.isTemplate) });
});

export const instantiateTemplate = asyncHandler(async (req, res) => {
    const assignment = await writingService.instantiateTemplate({
        schoolId: req.schoolId,
        templateId: req.params.templateId,
        userId: req.user._id,
        academicYear: resolveAcademicYearForRequest(req),
        payload: req.body || {}
    });
    res.status(201).json({ success: true, data: assignment });
});

export const getBoard = asyncHandler(async (req, res) => {
    const board = await writingService.getTeacherBoard({
        schoolId: req.schoolId,
        assignmentId: req.params.assignmentId,
        classId: req.query.classId
    });
    res.json({ success: true, data: board });
});

export const getProgress = asyncHandler(async (req, res) => {
    const progress = await writingService.getClassProgress({
        schoolId: req.schoolId,
        assignmentId: req.params.assignmentId
    });
    res.json({ success: true, data: progress });
});

export const getProjectHistory = asyncHandler(async (req, res) => {
    const history = await writingService.getProjectHistory({
        schoolId: req.schoolId,
        projectId: req.params.projectId
    });
    res.json({ success: true, data: history });
});

/* ------------------------------------------------------------------ */
/* Student — no AI is reachable from any of these                      */
/* ------------------------------------------------------------------ */

export const myWriting = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const feed = await writingService.getStudentFeed({
        schoolId: req.schoolId,
        studentId: student._id,
        academicYear: resolveAcademicYearForRequest(req)
    });
    res.json({ success: true, data: feed });
});

export const myProject = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const project = await writingService.openProject({
        schoolId: req.schoolId,
        studentId: student._id,
        assignmentId: req.params.assignmentId,
        academicYear: resolveAcademicYearForRequest(req)
    });
    res.json({ success: true, data: project });
});

export const myProjectById = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const project = await writingService.getStudentProject({
        schoolId: req.schoolId,
        projectId: req.params.projectId,
        studentId: student._id
    });
    res.json({ success: true, data: project });
});

export const autosaveProject = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const result = await writingService.autosaveProject({
        schoolId: req.schoolId,
        projectId: req.params.projectId,
        studentId: student._id,
        payload: req.body || {}
    });
    res.json({ success: true, data: result });
});

export const submitProject = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const result = await writingService.submitDraft({
        schoolId: req.schoolId,
        projectId: req.params.projectId,
        studentId: student._id,
        payload: req.body || {}
    });
    res.status(201).json({ success: true, data: result });
});

export const markNotebookWritten = asyncHandler(async (req, res) => {
    const student = await studentForRequest(req);
    const result = await writingService.markNotebookWritten({
        schoolId: req.schoolId,
        projectId: req.params.projectId,
        studentId: student._id
    });
    res.json({ success: true, data: result });
});
