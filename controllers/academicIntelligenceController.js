import Class from '../models/Class.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { getTeacherAssignments, isTeacherAuthorizedForClassSubject, resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { getStudentLearningTrace } from '../services/learningTraceService.js';
import { getAssessmentObjectiveAnalysis, getClassObjectivePerformance } from '../services/objectivePerformanceService.js';
import { createAssessmentReflection, getAssessmentReflection, updateAssessmentReflection } from '../services/assessmentReflectionService.js';
import { getParentLearningSummary } from '../services/parentInsightService.js';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const parseDateRange = (query = {}) => {
    const range = {};
    if (query.from) {
        const from = new Date(query.from);
        if (!Number.isNaN(from.getTime())) {
            from.setHours(0, 0, 0, 0);
            range.$gte = from;
        }
    }
    if (query.to) {
        const to = new Date(query.to);
        if (!Number.isNaN(to.getTime())) {
            to.setHours(23, 59, 59, 999);
            range.$lte = to;
        }
    }
    return range.$gte || range.$lte ? range : null;
};

const parseCategoryFilter = (query = {}) => {
    const value = String(query.category || '').trim();
    if (!value || value.toLowerCase() === 'all') return null;
    return value;
};

const enforceDepartmentScopeForStudent = (req, student) => {
    if (req.user.role !== 'department_principal' || !req.departmentId) return true;
    const departmentId = toIdString(student?.department || student?.currentClass?.department);
    return departmentId && departmentId === toIdString(req.departmentId);
};

const enforceDepartmentScopeForClass = (req, classDoc) => {
    if (req.user.role !== 'department_principal' || !req.departmentId) return true;
    return toIdString(classDoc?.department) === toIdString(req.departmentId);
};

export const createAcademicIntelligenceController = (dependencies = {}) => {
    const deps = {
        Class,
        Student,
        getTeacherAssignments,
        isTeacherAuthorizedForClassSubject,
        resolveTeacherProfile,
        getStudentLearningTrace,
        getAssessmentObjectiveAnalysis,
        getClassObjectivePerformance,
        createAssessmentReflection,
        getAssessmentReflection,
        updateAssessmentReflection,
        getParentLearningSummary,
        ...dependencies
    };

    const loadStudentForAccess = async ({ schoolId, studentId, academicYear = null }) => deps.Student.findOne({
        _id: studentId,
        school: schoolId,
        ...(academicYear ? { academicYear } : {})
    })
        .populate('currentClass', 'name grade section department')
        .lean();

    const enforceStudentAccess = async ({ req, student, subjectId = null }) => {
        if (!student) return { allowed: false, status: 404, message: 'Student not found' };

        if (req.user.role === 'student') {
            const selfStudent = await deps.Student.findOne({ user: req.user._id, school: req.schoolId }).select('_id').lean();
            if (toIdString(selfStudent?._id) !== toIdString(student._id)) {
                return { allowed: false, status: 403, message: 'Access denied' };
            }
            return { allowed: true, assignmentSet: null };
        }

        if (!enforceDepartmentScopeForStudent(req, student)) {
            return { allowed: false, status: 403, message: 'Access denied' };
        }

        if (req.user.role !== 'teacher') {
            return { allowed: true, assignmentSet: null };
        }

        const teacherProfile = await deps.resolveTeacherProfile(req);
        if (!teacherProfile) {
            return { allowed: false, status: 403, message: 'Teacher profile not found' };
        }

        const classId = student.currentClass?._id || student.currentClass;
        if (!classId) {
            return { allowed: false, status: 403, message: 'Student is not assigned to a class' };
        }

        if (subjectId) {
            const allowed = await deps.isTeacherAuthorizedForClassSubject(teacherProfile._id, classId, subjectId);
            return allowed
                ? { allowed: true, assignmentSet: [{ classId, subjectId }] }
                : { allowed: false, status: 403, message: 'Access denied' };
        }

        const assignmentSet = await deps.getTeacherAssignments(teacherProfile._id);
        const teachesClass = assignmentSet.some((assignment) => toIdString(assignment.classId) === toIdString(classId));
        return teachesClass
            ? { allowed: true, assignmentSet }
            : { allowed: false, status: 403, message: 'Access denied' };
    };

    const enforceClassAccess = async ({ req, classDoc, subjectId = null }) => {
        if (!classDoc) return { allowed: false, status: 404, message: 'Class not found' };
        if (!enforceDepartmentScopeForClass(req, classDoc)) {
            return { allowed: false, status: 403, message: 'Access denied' };
        }
        if (req.user.role !== 'teacher') {
            return { allowed: true, assignmentSet: null };
        }

        const teacherProfile = await deps.resolveTeacherProfile(req);
        if (!teacherProfile) {
            return { allowed: false, status: 403, message: 'Teacher profile not found' };
        }

        if (subjectId) {
            const allowed = await deps.isTeacherAuthorizedForClassSubject(teacherProfile._id, classDoc._id, subjectId);
            return allowed
                ? { allowed: true, assignmentSet: [{ classId: classDoc._id, subjectId }] }
                : { allowed: false, status: 403, message: 'Access denied' };
        }

        const assignmentSet = await deps.getTeacherAssignments(teacherProfile._id);
        const filtered = assignmentSet.filter((assignment) => toIdString(assignment.classId) === toIdString(classDoc._id));
        return filtered.length > 0
            ? { allowed: true, assignmentSet: filtered }
            : { allowed: false, status: 403, message: 'Access denied' };
    };

    const getStudentLearningTraceController = asyncHandler(async (req, res) => {
        const student = await loadStudentForAccess({
            schoolId: req.schoolId,
            studentId: req.params.id,
            academicYear: req.academicYear
        });
        const access = await enforceStudentAccess({ req, student, subjectId: req.query.subjectId || null });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const data = await deps.getStudentLearningTrace({
            school: req.school,
            studentId: student._id,
            academicYear: req.academicYear,
            subjectId: req.query.subjectId || null,
            dateRange: parseDateRange(req.query || {}),
            category: parseCategoryFilter(req.query || {}),
            assignmentSet: access.assignmentSet
        });

        return res.status(200).json({ success: true, data });
    });

    const getClassObjectivePerformanceController = asyncHandler(async (req, res) => {
        const classDoc = await deps.Class.findOne({ _id: req.params.id, school: req.schoolId }).select('name department').lean();
        const access = await enforceClassAccess({ req, classDoc, subjectId: req.query.subjectId || null });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const subjectIds = req.query.subjectId
            ? [req.query.subjectId]
            : (access.assignmentSet || []).map((assignment) => toIdString(assignment.subjectId)).filter(Boolean);

        if (req.user.role === 'teacher' && subjectIds.length === 0) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        if (subjectIds.length <= 1) {
            const result = await deps.getClassObjectivePerformance({
                school: req.school,
                classId: classDoc._id,
                subjectId: subjectIds[0] || null,
                academicYear: req.academicYear,
                dateRange: parseDateRange(req.query || {}),
                category: parseCategoryFilter(req.query || {})
            });
            return res.status(200).json({ success: true, data: result });
        }

        const results = await Promise.all(subjectIds.map((subjectId) => deps.getClassObjectivePerformance({
            school: req.school,
            classId: classDoc._id,
            subjectId,
            academicYear: req.academicYear,
            dateRange: parseDateRange(req.query || {}),
            category: parseCategoryFilter(req.query || {})
        })));

        return res.status(200).json({ success: true, data: { classId: classDoc._id, subjects: results } });
    });

    const getAssessmentObjectiveAnalysisController = asyncHandler(async (req, res) => {
        const result = await deps.getAssessmentObjectiveAnalysis({ school: req.school, assessmentId: req.params.id });
        if (!result) {
            return res.status(404).json({ success: false, message: 'Assessment not found' });
        }

        const classDoc = await deps.Class.findOne({ _id: result.class?._id || result.class, school: req.schoolId }).select('department').lean();
        const access = await enforceClassAccess({ req, classDoc, subjectId: result.subject?._id || result.subject });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        return res.status(200).json({ success: true, data: result });
    });

    const resolveReflectionTeacherId = (req) => {
        if (req.user.role === 'admin' && req.body.teacherId) return req.body.teacherId;
        if (req.user.role === 'admin' && req.query.teacherId) return req.query.teacherId;
        return req.user._id;
    };

    const createAssessmentReflectionController = asyncHandler(async (req, res) => {
        const analysis = await deps.getAssessmentObjectiveAnalysis({ school: req.school, assessmentId: req.params.id });
        if (!analysis) {
            return res.status(404).json({ success: false, message: 'Assessment not found' });
        }

        const classDoc = await deps.Class.findOne({ _id: analysis.class?._id || analysis.class, school: req.schoolId }).select('department').lean();
        const access = await enforceClassAccess({ req, classDoc, subjectId: analysis.subject?._id || analysis.subject });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const teacherId = resolveReflectionTeacherId(req);
        const existing = await deps.getAssessmentReflection({
            schoolId: req.schoolId,
            assessmentGroupId: analysis.assessmentGroupId,
            teacherId
        });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Reflection already exists for this assessment and teacher' });
        }

        const reflection = await deps.createAssessmentReflection({
            schoolId: req.schoolId,
            assessmentGroupId: analysis.assessmentGroupId,
            teacherId,
            payload: {
                ...req.body,
                weakObjectives: req.body.weakObjectives || analysis.weakObjectives
            }
        });

        return res.status(201).json({ success: true, data: reflection });
    });

    const getAssessmentReflectionController = asyncHandler(async (req, res) => {
        const analysis = await deps.getAssessmentObjectiveAnalysis({ school: req.school, assessmentId: req.params.id });
        if (!analysis) {
            return res.status(404).json({ success: false, message: 'Assessment not found' });
        }

        const classDoc = await deps.Class.findOne({ _id: analysis.class?._id || analysis.class, school: req.schoolId }).select('department').lean();
        const access = await enforceClassAccess({ req, classDoc, subjectId: analysis.subject?._id || analysis.subject });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const teacherId = req.user.role === 'admin' && req.query.teacherId ? req.query.teacherId : (req.user.role === 'teacher' ? req.user._id : null);
        const reflection = await deps.getAssessmentReflection({
            schoolId: req.schoolId,
            assessmentGroupId: analysis.assessmentGroupId,
            teacherId
        });

        return res.status(200).json({ success: true, data: reflection });
    });

    const updateAssessmentReflectionController = asyncHandler(async (req, res) => {
        const analysis = await deps.getAssessmentObjectiveAnalysis({ school: req.school, assessmentId: req.params.id });
        if (!analysis) {
            return res.status(404).json({ success: false, message: 'Assessment not found' });
        }

        const classDoc = await deps.Class.findOne({ _id: analysis.class?._id || analysis.class, school: req.schoolId }).select('department').lean();
        const access = await enforceClassAccess({ req, classDoc, subjectId: analysis.subject?._id || analysis.subject });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const teacherId = resolveReflectionTeacherId(req);
        const reflection = await deps.updateAssessmentReflection({
            schoolId: req.schoolId,
            assessmentGroupId: analysis.assessmentGroupId,
            teacherId,
            payload: req.body
        });

        if (!reflection) {
            return res.status(404).json({ success: false, message: 'Reflection not found' });
        }

        return res.status(200).json({ success: true, data: reflection });
    });

    const getStudentParentLearningSummaryController = asyncHandler(async (req, res) => {
        const student = await loadStudentForAccess({
            schoolId: req.schoolId,
            studentId: req.params.id,
            academicYear: req.academicYear
        });
        const access = await enforceStudentAccess({ req, student, subjectId: req.query.subjectId || null });
        if (!access.allowed) {
            return res.status(access.status).json({ success: false, message: access.message });
        }

        const data = await deps.getParentLearningSummary({
            school: req.school,
            studentId: student._id,
            academicYear: req.academicYear,
            dateRange: parseDateRange(req.query || {}),
            assignmentSet: access.assignmentSet
        });

        return res.status(200).json({ success: true, data });
    });

    const getParentChildLearningSummaryController = asyncHandler(async (req, res) => {
        const student = await loadStudentForAccess({
            schoolId: req.schoolId,
            studentId: req.params.childId,
            academicYear: req.academicYear
        });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Child not found' });
        }

        const parentEmail = String(req.user?.email || '').trim().toLowerCase();
        const linkedEmails = [
            student.parentInfo?.fatherEmail,
            student.parentInfo?.motherEmail,
            student.parentInfo?.guardianEmail
        ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
        if (!linkedEmails.includes(parentEmail)) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const data = await deps.getParentLearningSummary({
            school: req.school,
            studentId: student._id,
            academicYear: req.academicYear,
            dateRange: parseDateRange(req.query || {})
        });

        return res.status(200).json({ success: true, data });
    });

    return {
        getStudentLearningTraceController,
        getClassObjectivePerformanceController,
        getAssessmentObjectiveAnalysisController,
        createAssessmentReflectionController,
        getAssessmentReflectionController,
        updateAssessmentReflectionController,
        getStudentParentLearningSummaryController,
        getParentChildLearningSummaryController
    };
};

const academicIntelligenceController = createAcademicIntelligenceController();

export const getStudentLearningTraceController = academicIntelligenceController.getStudentLearningTraceController;
export const getClassObjectivePerformanceController = academicIntelligenceController.getClassObjectivePerformanceController;
export const getAssessmentObjectiveAnalysisController = academicIntelligenceController.getAssessmentObjectiveAnalysisController;
export const createAssessmentReflectionController = academicIntelligenceController.createAssessmentReflectionController;
export const getAssessmentReflectionController = academicIntelligenceController.getAssessmentReflectionController;
export const updateAssessmentReflectionController = academicIntelligenceController.updateAssessmentReflectionController;
export const getStudentParentLearningSummaryController = academicIntelligenceController.getStudentParentLearningSummaryController;
export const getParentChildLearningSummaryController = academicIntelligenceController.getParentChildLearningSummaryController;