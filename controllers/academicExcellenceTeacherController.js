import mongoose from 'mongoose';
import AcademicExcellenceObjective from '../models/AcademicExcellenceObjective.js';
import AcademicExcellenceTask from '../models/AcademicExcellenceTask.js';
import AcademicExcellenceExclusion from '../models/AcademicExcellenceExclusion.js';
import Student from '../models/Student.js';
import Standard from '../models/Standard.js';
import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import Subject from '../models/Subject.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile, getTeacherAssignments, getTeacherClassIds } from '../helpers/teacherScoping.js';
import { applyExclusions } from '../services/academicExcellenceService.js';
import { assignTask, bulkAssignTasks, reviewTask, getTeacherTaskQueue } from '../services/academicExcellenceTaskService.js';
import { resolveStandardForObjective } from '../services/academicExcellenceStandardResolver.js';
import {
    buildDefaultAssignmentTitle,
    createStandardAssignmentWithPool,
    resolvePreGeneratedQuestionCount
} from '../services/standardAssignmentService.js';
import {
    createExclusion,
    toggleExclusion,
    getActiveExclusions
} from '../services/academicExcellenceSettingsService.js';
import { connectAi } from '../utils/connectAi.js';
import { sanitizeObjectiveText, isObjectiveTextDegenerate } from '../utils/sanitizeObjectiveText.js';

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

const ALLOWED_QUESTION_TYPES = ['multiple_choice', 'short_answer', 'true_false'];
const ALLOWED_DIFFICULTIES = ['easy', 'medium', 'hard'];
const ALLOWED_SESSION_TYPES = ['assessment', 'homework', 'classwork', 'practice'];

export const validateAIPracticePayload = (payload = {}) => {
    const {
        objectiveKey,
        objectiveName,
        classId,
        subjectId,
        questionCount,
        questionTypes,
        difficulties,
        sessionType,
        dueDate,
        title,
        students
    } = payload;

    if (!String(objectiveKey || '').trim() || !String(objectiveName || '').trim()) {
        const error = new Error('objectiveKey and objectiveName are required.');
        error.statusCode = 400;
        throw error;
    }

    if (!toIdString(classId) || !toIdString(subjectId)) {
        const error = new Error('classId and subjectId are required.');
        error.statusCode = 400;
        throw error;
    }

    const numericQuestionCount = Number(questionCount);
    if (!Number.isInteger(numericQuestionCount) || numericQuestionCount < 1 || numericQuestionCount > 50) {
        const error = new Error('Question count must be between 1 and 50.');
        error.statusCode = 400;
        error.code = 'INVALID_QUESTION_COUNT';
        throw error;
    }

    if (!Array.isArray(questionTypes) || questionTypes.length === 0) {
        const error = new Error('At least one valid question type is required.');
        error.statusCode = 400;
        error.code = 'INVALID_QUESTION_TYPES';
        throw error;
    }

    const hasInvalidQuestionType = questionTypes.some((item) => !ALLOWED_QUESTION_TYPES.includes(item));
    if (hasInvalidQuestionType) {
        const error = new Error('At least one valid question type is required.');
        error.statusCode = 400;
        error.code = 'INVALID_QUESTION_TYPES';
        throw error;
    }

    if (Array.isArray(difficulties) && difficulties.length > 0) {
        const hasInvalidDifficulty = difficulties.some((item) => !ALLOWED_DIFFICULTIES.includes(item));
        if (hasInvalidDifficulty) {
            const error = new Error('Invalid difficulty values provided.');
            error.statusCode = 400;
            throw error;
        }
    }

    if (sessionType && !ALLOWED_SESSION_TYPES.includes(sessionType)) {
        const error = new Error('Invalid sessionType value.');
        error.statusCode = 400;
        throw error;
    }

    if (dueDate) {
        const parsed = new Date(dueDate);
        if (Number.isNaN(parsed.getTime())) {
            const error = new Error('dueDate must be a valid date.');
            error.statusCode = 400;
            throw error;
        }
    }

    if (title && String(title).length > 200) {
        const error = new Error('title must be 200 characters or less.');
        error.statusCode = 400;
        throw error;
    }

    if (students !== undefined && !Array.isArray(students)) {
        const error = new Error('students must be an array of ids.');
        error.statusCode = 400;
        throw error;
    }
};

const ensureTeacherOwnsAssignment = async (req, assignmentId) => {
    const assignment = await StandardAssignment.findOne({
        _id: assignmentId,
        school: req.schoolId,
        isActive: true
    });

    if (!assignment) {
        return { ok: false, notFound: true, assignment: null };
    }

    if (['admin', 'department_principal', 'staff'].includes(req.user.role)) {
        return { ok: true, notFound: false, assignment };
    }

    if (req.user.role !== 'teacher') {
        return { ok: false, notFound: false, assignment };
    }

    const teacher = await resolveTeacherProfile(req);
    const ok = Boolean(teacher && assignment.teacher?.toString() === teacher._id.toString());
    return { ok, notFound: false, assignment };
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

    const match = { school: new mongoose.Types.ObjectId(req.schoolId), class: new mongoose.Types.ObjectId(classId), deletedAt: null };
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
        match.subject = new mongoose.Types.ObjectId(subjectId);
    }
    if (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) {
        match.academicYear = new mongoose.Types.ObjectId(academicYear);
    }
    // `semester` is not persisted on AcademicExcellenceObjective; ignore this filter.
    void semester;

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

    const match = { school: new mongoose.Types.ObjectId(req.schoolId), class: new mongoose.Types.ObjectId(classId), deletedAt: null };
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
        match.subject = new mongoose.Types.ObjectId(subjectId);
    }
    if (academicYear && mongoose.Types.ObjectId.isValid(academicYear)) {
        match.academicYear = new mongoose.Types.ObjectId(academicYear);
    }
    // `semester` is not persisted on AcademicExcellenceObjective; ignore this filter.
    void semester;

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
Objective/Standard: ${sanitizeObjectiveText(objectiveName || objectiveKey)}
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

/**
 * POST /academic-excellence/ai-practice
 * Creates a standard assignment + draft question pool from an AE objective.
 */
export const createAIPracticeAssignment = asyncHandler(async (req, res) => {
    validateAIPracticePayload(req.body || {});

    const teacherProfile = await resolveTeacherProfile(req);
    const teacherId = teacherProfile?._id || req.user._id;

    const {
        objectiveKey,
        objectiveName,
        classId,
        subjectId,
        questionCount,
        questionTypes,
        difficulties,
        sessionType,
        dueDate,
        title,
        students,
    } = req.body;

    const hasClassAccess = await ensureClassAccess(req, String(classId));
    if (!hasClassAccess) {
        return res.status(403).json({
            success: false,
            code: 'CLASS_ACCESS_DENIED',
            message: 'Access denied'
        });
    }

    const cleanedObjectiveName = sanitizeObjectiveText(objectiveName);
    const standard = await resolveStandardForObjective({
        objectiveKey,
        objectiveName: cleanedObjectiveName,
        schoolId: req.schoolId,
        subjectId,
        classId,
    });

    if (!standard) {
        return res.status(422).json({
            success: false,
            code: 'STANDARD_NOT_FOUND',
            message: `Could not find a matching standard for objective '${objectiveKey}'. Please assign manually or contact your curriculum coordinator.`
        });
    }

    const [classDoc, subjectDoc] = await Promise.all([
        Class.findOne({ _id: classId, school: req.schoolId }).lean(),
        Subject.findOne({ _id: subjectId, school: req.schoolId }).select('name').lean()
    ]);

    if (!classDoc) {
        return res.status(404).json({ success: false, message: 'Class not found' });
    }
    if (!subjectDoc) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
    }

    const effectiveObjectiveName = isObjectiveTextDegenerate(cleanedObjectiveName)
        ? (standard.name || `${standard.code || ''} ${standard.name || ''}`.trim())
        : cleanedObjectiveName;

    let assignmentResult;
    try {
        assignmentResult = await createStandardAssignmentWithPool({
            schoolId: req.schoolId,
            actorUserId: req.user._id,
            standard,
            classDoc,
            subjectId,
            subjectName: subjectDoc?.name || 'General Studies',
            teacherId,
            classId,
            students: Array.isArray(students) ? students : [],
            dueDate: dueDate || null,
            instructions: '',
            title: String(title || '').trim() || buildDefaultAssignmentTitle({
                standard,
                classDoc,
                sessionType: sessionType || 'practice'
            }),
            academicYear: classDoc.academicYear,
            semester: null,
            practiceConfig: {
                sessionType: sessionType || 'practice',
                questionLimit: resolvePreGeneratedQuestionCount(questionCount),
                allowedQuestionTypes: questionTypes,
                allowedDifficulties: Array.isArray(difficulties) && difficulties.length > 0
                    ? difficulties
                    : ['easy', 'medium', 'hard'],
            },
            preGeneratedQuestionCount: resolvePreGeneratedQuestionCount(questionCount),
            aiLanguages: ['en'],
            questionWorkflow: {
                requireApprovalBeforeStudentAccess: false,
                preGeneratedQuestionCount: resolvePreGeneratedQuestionCount(questionCount),
                status: 'published',
            },
            generationContext: {
                objectiveName: effectiveObjectiveName,
            },
            failOnGenerationError: true,
        });
    } catch (error) {
        if (error.code === 'AI_GENERATION_FAILED') {
            return res.status(502).json({
                success: false,
                code: 'AI_GENERATION_FAILED',
                message: 'Question generation failed. The assignment was saved — retry generation from the pool editor.',
                data: error.data || null,
            });
        }
        throw error;
    }

    const { assignment, pool } = assignmentResult;

    res.status(201).json({
        success: true,
        data: {
            assignmentId: assignment._id,
            poolStatus: pool?.status || 'draft',
            generatedCount: Array.isArray(pool?.questions) ? pool.questions.length : 0,
            standardCode: standard.code,
            standardName: standard.name,
            reviewUrl: `/standards/assignments/${assignment._id}/pool`
        }
    });
});

/**
 * GET /academic-excellence/ai-practice/:assignmentId/pool
 */
export const getAIPracticePool = asyncHandler(async (req, res) => {
    const { assignmentId } = req.params;

    const ownership = await ensureTeacherOwnsAssignment(req, assignmentId);
    if (ownership.notFound) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    if (!ownership.ok) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const [assignment, pool] = await Promise.all([
        StandardAssignment.findOne({ _id: assignmentId, school: req.schoolId, isActive: true })
            .populate('standard', 'code name description gradeLevel')
            .populate('class', 'name grade section')
            .populate('subject', 'name code')
            .lean(),
        StandardQuestionPool.findOne({ assignment: assignmentId, school: req.schoolId, isActive: true }).lean(),
    ]);

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    res.json({
        success: true,
        data: {
            assignment,
            questionWorkflow: assignment.questionWorkflow || null,
            questionPool: pool || null,
        }
    });
});

/* ─── Objective Edit / Delete ────────────────────────────────────── */

/**
 * PATCH /academic-excellence/objectives/:objectiveId/rename
 * Renames an objective's display name across all student records that
 * share the same objectiveKey within the school.
 */
export const renameAcademicExcellenceObjective = asyncHandler(async (req, res) => {
    const { objectiveId } = req.params;
    const { objectiveName } = req.body;

    if (!objectiveName || typeof objectiveName !== 'string' || !objectiveName.trim()) {
        return res.status(400).json({ success: false, message: 'objectiveName is required' });
    }

    const trimmedName = objectiveName.trim().slice(0, 300);

    const objective = await AcademicExcellenceObjective.findOne({
        _id: objectiveId,
        school: req.schoolId,
        deletedAt: null
    });

    if (!objective) {
        return res.status(404).json({ success: false, message: 'Objective not found' });
    }

    // Rename all records sharing the same objectiveKey within school
    const result = await AcademicExcellenceObjective.updateMany(
        { school: req.schoolId, objectiveKey: objective.objectiveKey, deletedAt: null },
        { $set: { objectiveName: trimmedName, lastUpdatedAt: new Date() } }
    );

    res.json({
        success: true,
        data: {
            objectiveKey: objective.objectiveKey,
            objectiveName: trimmedName,
            updatedCount: result.modifiedCount
        }
    });
});

/**
 * DELETE /academic-excellence/objectives/:objectiveId
 * Soft-deletes an objective and all associated student records that
 * share the same objectiveKey within the school.
 */
export const softDeleteAcademicExcellenceObjective = asyncHandler(async (req, res) => {
    const { objectiveId } = req.params;

    const objective = await AcademicExcellenceObjective.findOne({
        _id: objectiveId,
        school: req.schoolId,
        deletedAt: null
    });

    if (!objective) {
        return res.status(404).json({ success: false, message: 'Objective not found' });
    }

    const now = new Date();
    const result = await AcademicExcellenceObjective.updateMany(
        { school: req.schoolId, objectiveKey: objective.objectiveKey, deletedAt: null },
        { $set: { deletedAt: now, lastUpdatedAt: now } }
    );

    res.json({
        success: true,
        data: {
            objectiveKey: objective.objectiveKey,
            deletedCount: result.modifiedCount
        }
    });
});
