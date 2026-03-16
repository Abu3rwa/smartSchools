import mongoose from 'mongoose';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import AcademicExcellenceTask from '../models/AcademicExcellenceTask.js';
import AcademicExcellenceExclusion from '../models/AcademicExcellenceExclusion.js';
import Student from '../models/Student.js';
import Standard from '../models/Standard.js';
import StandardAssignment from '../models/StandardAssignment.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherAssignments, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { applyExclusions } from '../services/academicExcellenceService.js';
import { assignTask, bulkAssignTasks, reviewTask, getTeacherTaskQueue } from '../services/academicExcellenceTaskService.js';
import {
    createExclusion,
    toggleExclusion,
    getActiveExclusions
} from '../services/academicExcellenceSettingsService.js';
import { connectAi } from '../utils/connectAi.js';

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
 * Merges AcademicExcellenceObjective records with assigned Standards
 * so teachers see objectives even before grades exist.
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

    // 1) Tracked objectives from AE sync
    const [trackedObjectives, trackedTotal] = await Promise.all([
        AcademicExcellenceObjective.find(match)
            .sort({ objectiveKey: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('student', 'firstName lastName studentId')
            .populate('subject', 'name')
            .lean(),
        AcademicExcellenceObjective.countDocuments(match)
    ]);

    const filtered = await applyExclusions({ objectiveList: trackedObjectives, schoolId: req.schoolId, classId });

    // 2) Also pull available standards assigned to this class so the
    //    teacher sees objectives even if no grades have been recorded yet.
    const assignmentQuery = { school: req.schoolId, class: classId };
    if (subjectId) assignmentQuery.subject = subjectId;

    const assignments = await StandardAssignment.find(assignmentQuery)
        .populate('standard', 'code name description subject gradeLevel category')
        .lean();

    const trackedKeys = new Set(filtered.map((o) => o.objectiveKey));
    const availableFromStandards = [];
    for (const sa of assignments) {
        const std = sa.standard;
        if (!std || trackedKeys.has(std.code)) continue;
        trackedKeys.add(std.code);
        availableFromStandards.push({
            _id: `std_${std._id}`,
            objectiveKey: std.code,
            objectiveName: std.name,
            description: std.description,
            masteryLevel: 'not_started',
            masteryScore: 0,
            trend: 'stable',
            subject: std.subject,
            source: 'standard'
        });
    }

    const combined = [...filtered, ...availableFromStandards];

    res.json({
        success: true,
        data: {
            objectives: combined,
            pagination: { page, limit, total: trackedTotal + availableFromStandards.length, pages: Math.ceil((trackedTotal + availableFromStandards.length) / limit) }
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

    const { classId } = req.query;
    const teacherIdFilter = req.user.role === 'teacher' ? teacherProfile._id : null;

    const tasks = await getTeacherTaskQueue(teacherIdFilter || req.user._id, classId || null);

    res.json({ success: true, data: { tasks } });
});

/**
 * POST /academic-excellence/tasks
 * Assign a single practice task.
 */
export const createAcademicExcellenceTask = asyncHandler(async (req, res) => {
    const teacherProfile = await resolveTeacherProfile(req);
    const teacherId = teacherProfile?._id || req.user._id;

    const { studentId, objectiveKey, title, description, taskType, dueDate, estimatedMinutes, classId, subjectId } = req.body;

    const task = await assignTask(teacherId, studentId, objectiveKey, {
        title,
        description,
        taskType,
        dueDate,
        estimatedMinutes,
        classId,
        subjectId
    }, { schoolId: req.schoolId });

    res.status(201).json({ success: true, data: { task } });
});

/**
 * POST /academic-excellence/tasks/bulk
 * Bulk-assign tasks to a class.
 */
export const bulkCreateAcademicExcellenceTasks = asyncHandler(async (req, res) => {
    const teacherProfile = await resolveTeacherProfile(req);
    const teacherId = teacherProfile?._id || req.user._id;

    const { classId, objectiveKey, title, description, taskType, dueDate, estimatedMinutes, subjectId } = req.body;

    const result = await bulkAssignTasks(teacherId, classId, objectiveKey, {
        title,
        description,
        taskType,
        dueDate,
        estimatedMinutes,
        subjectId
    }, { schoolId: req.schoolId });

    res.status(201).json({ success: true, data: result });
});

/**
 * PATCH /academic-excellence/tasks/:taskId/review
 * Teacher reviews a completed task.
 */
export const reviewAcademicExcellenceTask = asyncHandler(async (req, res) => {
    const teacherProfile = await resolveTeacherProfile(req);
    const teacherId = teacherProfile?._id || req.user._id;

    const task = await reviewTask(teacherId, req.params.taskId, req.body.teacherFeedback || '');

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

    const result = await getActiveExclusions(req.schoolId, {
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
    const exclusion = await createExclusion(req.user._id, {
        ...req.body,
        school: req.schoolId
    });

    res.status(201).json({ success: true, data: { exclusion } });
});

/**
 * PATCH /academic-excellence/exclusions/:exclusionId/toggle
 */
export const toggleAcademicExcellenceExclusion = asyncHandler(async (req, res) => {
    // Toggle: flip the current state
    const existing = await AcademicExcellenceExclusion.findOne({ _id: req.params.exclusionId, school: req.schoolId }).lean();
    if (!existing) {
        return res.status(404).json({ success: false, message: 'Exclusion not found' });
    }
    const exclusion = await toggleExclusion(req.params.exclusionId, !existing.isActive);

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

/* ─── AI Task Generation ─────────────────────────────────────────── */

/**
 * POST /academic-excellence/tasks/generate
 * Uses AI to generate practice task content (questions/exercises)
 * based on the selected objective.
 */
export const generateAcademicExcellenceTask = asyncHandler(async (req, res) => {
    const { objectiveKey, objectiveName, subjectName, gradeLevel, taskType, language } = req.body;

    if (!objectiveKey && !objectiveName) {
        return res.status(400).json({ success: false, message: 'objectiveKey or objectiveName is required' });
    }

    const lang = language || 'English';
    const type = taskType || 'practice_questions';

    const taskTypeLabels = {
        practice_questions: 'practice questions with clear answers',
        reading: 'a focused reading comprehension exercise with questions',
        teacher_review: 'a structured review checklist for the teacher to assess the student',
        peer_discussion: 'discussion prompts for peer-to-peer learning',
        project: 'a mini-project with clear deliverables and rubric',
        custom: 'a creative learning activity'
    };

    const activityDescription = taskTypeLabels[type] || taskTypeLabels.practice_questions;

    const prompt = `You are an expert curriculum designer. Generate a practice task for a student.

Subject: ${subjectName || 'General'}
Grade Level: ${gradeLevel || 'Not specified'}
Objective/Standard: ${objectiveName || objectiveKey}
Standard Code: ${objectiveKey || ''}
Activity Type: ${activityDescription}
Language: ${lang}

Generate the following in JSON format:
{
  "title": "A concise task title (max 80 chars)",
  "description": "Detailed task instructions with the actual exercises/questions. Include 3-5 practice items. Each item should test understanding of the objective. Do NOT include video links or external URLs.",
  "estimatedMinutes": <number between 10-30>
}

IMPORTANT:
- Generate actual practice content (questions, exercises, prompts) — NOT just a description of what to do.
- Do NOT include video links, YouTube links, or any external URLs.
- The description must be self-contained: the student should be able to complete the task using only the description text.
- Write in ${lang}.
- Return ONLY valid JSON, no markdown fences.`;

    const aiResult = await connectAi(prompt);
    let generated;
    try {
        // Strip potential markdown fences
        const cleaned = aiResult.text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        generated = JSON.parse(cleaned);
    } catch {
        return res.status(500).json({ success: false, message: 'AI returned invalid format. Please try again.' });
    }

    res.json({
        success: true,
        data: {
            title: String(generated.title || '').slice(0, 120),
            description: String(generated.description || ''),
            estimatedMinutes: Math.max(5, Math.min(60, Number(generated.estimatedMinutes) || 15)),
            taskType: type,
            objectiveKey,
            objectiveName
        }
    });
});
