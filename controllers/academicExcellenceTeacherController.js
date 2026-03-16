import mongoose from 'mongoose';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import AcademicExcellenceTask from '../models/AcademicExcellenceTask.js';
import AcademicExcellenceExclusion from '../models/AcademicExcellenceExclusion.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherAssignments, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { applyExclusions } from '../services/academicExcellenceService.js';
import { assignTask, bulkAssignTasks, reviewTask, getTeacherTaskQueue } from '../services/academicExcellenceTaskService.js';
import {
    createExclusion,
    toggleExclusion,
    getActiveExclusions
} from '../services/academicExcellenceSettingsService.js';

/* ─── helpers ────────────────────────────────────────────────────────── */

const toIdString = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    if (v?._id) return String(v._id).trim();
    return String(v).trim();
};

const parsePagination = (query = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 20));
    return { page, limit };
};

/**
 * Ensure the requesting teacher (or admin/dept_principal) is authorised
 * for the given classId.
 */
const ensureClassAccess = async (req, classId) => {
    if (['admin', 'department_principal'].includes(req.user.role)) return true;

    const teacherProfile = await resolveTeacherProfile(req);
    if (!teacherProfile) return false;

    const classIds = await getTeacherClassIds(teacherProfile._id);
    return classIds.some((id) => id.toString() === classId);
};

/* ─── Class-level endpoints (mounted on /classes/:id/academic-excellence) ── */

/**
 * GET /classes/:id/academic-excellence
 * Class summary: mastery distribution, per-subject breakdown, KPIs.
 */
export const getClassAcademicExcellenceSummary = asyncHandler(async (req, res) => {
    const classId = req.params.id;
    if (!await ensureClassAccess(req, classId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { subjectId, academicYear, semester } = req.query;

    const match = { school: new mongoose.Types.ObjectId(req.schoolId), class: new mongoose.Types.ObjectId(classId) };
    if (subjectId) match.subject = new mongoose.Types.ObjectId(subjectId);
    if (academicYear) match.academicYear = academicYear;
    if (semester) match.semester = semester;

    const [distribution, subjectAgg, totalStudents] = await Promise.all([
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            { $group: { _id: '$masteryLevel', count: { $sum: 1 } } }
        ]),
        AcademicExcellenceObjective.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$subject',
                    total: { $sum: 1 },
                    mastered: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'mastered'] }, 1, 0] } },
                    progressing: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'progressing'] }, 1, 0] } },
                    notMet: { $sum: { $cond: [{ $eq: ['$masteryLevel', 'not_met'] }, 1, 0] } }
                }
            },
            {
                $lookup: {
                    from: 'subjects',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'subjectDoc'
                }
            },
            { $unwind: { path: '$subjectDoc', preserveNullAndEmptyArrays: true } },
            { $project: { _id: 1, name: '$subjectDoc.name', total: 1, mastered: 1, progressing: 1, notMet: 1 } }
        ]),
        Student.countDocuments({ currentClass: classId, school: req.schoolId })
    ]);

    const masteryDistribution = {};
    for (const d of distribution) {
        masteryDistribution[d._id || 'unknown'] = d.count;
    }

    res.json({
        success: true,
        data: {
            classId,
            totalStudents,
            masteryDistribution,
            subjects: subjectAgg
        }
    });
});

/**
 * GET /classes/:id/academic-excellence/objectives
 * Paginated list of objectives for a class.
 */
export const getClassAcademicExcellenceObjectives = asyncHandler(async (req, res) => {
    const classId = req.params.id;
    if (!await ensureClassAccess(req, classId)) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { subjectId, academicYear, semester } = req.query;
    const { page, limit } = parsePagination(req.query);

    const match = { school: new mongoose.Types.ObjectId(req.schoolId), class: new mongoose.Types.ObjectId(classId) };
    if (subjectId) match.subject = new mongoose.Types.ObjectId(subjectId);
    if (academicYear) match.academicYear = academicYear;
    if (semester) match.semester = semester;

    const [objectives, total] = await Promise.all([
        AcademicExcellenceObjective.find(match)
            .sort({ objectiveKey: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('student', 'firstName lastName studentId')
            .populate('subject', 'name')
            .lean(),
        AcademicExcellenceObjective.countDocuments(match)
    ]);

    const filtered = await applyExclusions(objectives, req.schoolId);

    res.json({
        success: true,
        data: {
            objectives: filtered,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        }
    });
});

/* ─── Standalone endpoints (mounted on /academic-excellence) ──────── */

/**
 * GET /academic-excellence/tasks/queue
 * Teacher's pending task queue.
 */
export const getAcademicExcellenceTaskQueue = asyncHandler(async (req, res) => {
    const teacherProfile = await resolveTeacherProfile(req);
    if (!teacherProfile && req.user.role === 'teacher') {
        return res.status(403).json({ success: false, message: 'Teacher profile not found' });
    }

    const { classId, academicYear, semester } = req.query;
    const { page, limit } = parsePagination(req.query);

    let teacherIdFilter = null;
    if (req.user.role === 'teacher') {
        teacherIdFilter = teacherProfile._id;
    }

    const result = await getTeacherTaskQueue({
        schoolId: req.schoolId,
        teacherId: teacherIdFilter,
        classId,
        academicYear,
        semester,
        page,
        limit
    });

    res.json({ success: true, data: result });
});

/**
 * POST /academic-excellence/tasks
 * Assign a single practice task.
 */
export const createAcademicExcellenceTask = asyncHandler(async (req, res) => {
    const task = await assignTask({
        ...req.body,
        school: req.schoolId,
        assignedBy: req.user._id
    });

    res.status(201).json({ success: true, data: { task } });
});

/**
 * POST /academic-excellence/tasks/bulk
 * Bulk-assign tasks to a class.
 */
export const bulkCreateAcademicExcellenceTasks = asyncHandler(async (req, res) => {
    const result = await bulkAssignTasks({
        ...req.body,
        school: req.schoolId,
        assignedBy: req.user._id
    });

    res.status(201).json({ success: true, data: result });
});

/**
 * PATCH /academic-excellence/tasks/:taskId/review
 * Teacher reviews a completed task.
 */
export const reviewAcademicExcellenceTask = asyncHandler(async (req, res) => {
    const task = await reviewTask(req.params.taskId, {
        ...req.body,
        reviewedBy: req.user._id,
        school: req.schoolId
    });

    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.json({ success: true, data: { task } });
});

/* ─── Exclusions ─────────────────────────────────────────────────── */

/**
 * GET /academic-excellence/exclusions
 */
export const getAcademicExcellenceExclusions = asyncHandler(async (req, res) => {
    const { classId, limit, page } = req.query;

    const result = await getActiveExclusions({
        schoolId: req.schoolId,
        classId,
        page,
        limit
    });

    res.json({ success: true, data: { exclusions: result.items, pagination: result.pagination } });
});

/**
 * POST /academic-excellence/exclusions
 */
export const createAcademicExcellenceExclusion = asyncHandler(async (req, res) => {
    const exclusion = await createExclusion({
        ...req.body,
        school: req.schoolId,
        createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: { exclusion } });
});

/**
 * PATCH /academic-excellence/exclusions/:exclusionId/toggle
 */
export const toggleAcademicExcellenceExclusion = asyncHandler(async (req, res) => {
    const exclusion = await toggleExclusion(req.params.exclusionId, req.schoolId);

    if (!exclusion) {
        return res.status(404).json({ success: false, message: 'Exclusion not found' });
    }

    res.json({ success: true, data: { exclusion } });
});

/**
 * DELETE /academic-excellence/exclusions/:exclusionId
 */
export const deleteAcademicExcellenceExclusion = asyncHandler(async (req, res) => {
    const exclusion = await AcademicExcellenceExclusion.findOneAndDelete({
        _id: req.params.exclusionId,
        school: req.schoolId
    });

    if (!exclusion) {
        return res.status(404).json({ success: false, message: 'Exclusion not found' });
    }

    res.json({ success: true, message: 'Exclusion deleted' });
});
