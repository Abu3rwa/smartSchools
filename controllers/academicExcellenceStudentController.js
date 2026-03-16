import mongoose from 'mongoose';
import Student from '../models/Student.js';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import AcademicExcellenceTask from '../models/AcademicExcellenceTask.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherAssignments } from '../helpers/teacherScoping.js';
import {
    getStudentExcellenceDashboardData,
    syncStudentObjectiveMastery,
    applyExclusions
} from '../services/academicExcellenceService.js';
import { completeTask } from '../services/academicExcellenceTaskService.js';

const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (value?._id) return String(value._id).trim();
    return String(value).trim();
};

const parsePagination = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 20));
    return { page, limit };
};

const parseStatusFilter = (value = '') => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'all') return null;
    const allowed = ['assigned', 'in_progress', 'completed', 'skipped', 'overdue'];
    return allowed.includes(normalized) ? normalized : null;
};

const loadStudentForRequest = async (req) => Student.findOne({
    _id: req.params.id,
    school: req.schoolId,
    ...(req.academicYear ? { academicYear: req.academicYear } : {})
})
    .populate('currentClass', 'name grade section department')
    .lean();

const enforceStudentResourceAccess = async (req, student) => {
    if (!student) {
        return { allowed: false, status: 404, message: 'Student not found' };
    }

    if (req.user.role === 'student') {
        const ownStudent = await Student.findOne({
            user: req.user._id,
            school: req.schoolId
        })
            .select('_id')
            .lean();

        if (toIdString(ownStudent?._id) !== toIdString(student._id)) {
            return { allowed: false, status: 403, message: 'Access denied' };
        }
        return { allowed: true };
    }

    if (req.user.role === 'department_principal' && req.departmentId) {
        const departmentId = toIdString(student?.department || student?.currentClass?.department);
        if (!departmentId || departmentId !== toIdString(req.departmentId)) {
            return { allowed: false, status: 403, message: 'Access denied' };
        }
    }

    if (req.user.role === 'teacher') {
        const teacherProfile = await resolveTeacherProfile(req);
        if (!teacherProfile) {
            return { allowed: false, status: 403, message: 'Teacher profile not found' };
        }

        const assignments = await getTeacherAssignments(teacherProfile._id);
        const classId = toIdString(student.currentClass?._id || student.currentClass);
        const hasClassAccess = assignments.some((item) => toIdString(item.classId) === classId);

        if (!hasClassAccess) {
            return { allowed: false, status: 403, message: 'Access denied' };
        }
    }

    return { allowed: true };
};

export const getStudentAcademicExcellenceDashboard = asyncHandler(async (req, res) => {
    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const data = await getStudentExcellenceDashboardData({
        school: req.school,
        studentId: student._id,
        subjectId: req.query.subjectId || null,
        academicYear: req.academicYear
    });

    return res.status(200).json({ success: true, data });
});

export const getStudentObjectivesList = asyncHandler(async (req, res) => {
    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const { page, limit } = parsePagination(req.query || {});
    const masteryLevel = String(req.query.masteryLevel || '').trim().toLowerCase();
    const subjectId = req.query.subjectId || null;

    await syncStudentObjectiveMastery({
        school: req.school,
        studentId: student._id,
        subjectId,
        academicYear: req.academicYear
    });

    const query = {
        school: req.schoolId,
        student: student._id
    };

    if (subjectId) query.subject = subjectId;
    if (masteryLevel && ['not_started', 'at_risk', 'developing', 'mastered'].includes(masteryLevel)) {
        query.masteryLevel = masteryLevel;
    }

    const allObjectives = await AcademicExcellenceObjective.find(query)
        .sort({ masteryScore: 1, updatedAt: -1 })
        .lean();

    const filteredObjectives = await applyExclusions({
        objectiveList: allObjectives,
        schoolId: req.schoolId,
        studentId: student._id,
        classId: student.currentClass?._id || student.currentClass
    });

    const total = filteredObjectives.length;
    const offset = (page - 1) * limit;
    const items = filteredObjectives.slice(offset, offset + limit);

    return res.status(200).json({
        success: true,
        data: {
            objectives: items,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

export const getStudentTasks = asyncHandler(async (req, res) => {
    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const { page, limit } = parsePagination(req.query || {});
    const subjectId = req.query.subjectId || null;
    const objectiveKey = String(req.query.objectiveKey || '').trim();
    const statusFilter = parseStatusFilter(req.query.status);

    const query = {
        school: req.schoolId,
        student: student._id
    };

    if (subjectId) query.subject = subjectId;
    if (objectiveKey) query.objectiveKey = objectiveKey;
    if (statusFilter) {
        query.status = statusFilter;
    }

    const [tasks, total] = await Promise.all([
        AcademicExcellenceTask.find(query)
            .sort({ dueDate: 1, createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        AcademicExcellenceTask.countDocuments(query)
    ]);

    return res.status(200).json({
        success: true,
        data: {
            tasks,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

export const studentCompleteTask = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({
            success: false,
            message: 'Only students can complete their own Academic Excellence tasks'
        });
    }

    if (!mongoose.isValidObjectId(req.params.taskId)) {
        return res.status(400).json({
            success: false,
            message: 'Invalid task ID format'
        });
    }

    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const completed = await completeTask(student._id, req.params.taskId, {
        studentScore: req.body?.studentScore,
        studentNotes: req.body?.studentNotes
    });

    if (!completed) {
        return res.status(404).json({
            success: false,
            message: 'Task not found'
        });
    }

    return res.status(200).json({
        success: true,
        message: 'Task completed successfully',
        data: {
            task: completed
        }
    });
});

export default {
    getStudentAcademicExcellenceDashboard,
    getStudentObjectivesList,
    getStudentTasks,
    studentCompleteTask
};
