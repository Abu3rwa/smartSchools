import LessonPlan from '../models/LessonPlan.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Standard from '../models/Standard.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as lessonPlanAIService from '../services/lessonPlanAIService.js';

const MODEL_NAME = 'gemini-2.5-flash-lite';
const VALID_SUGGEST_FIELDS = [
    'title', 'summary', 'description', 'homework', 'teachingObjectives', 'vocabulary',
    'previousKnowledge', 'characterTraitLinks', 'techIntegration', 'stageProcedure'
];

/**
 * @desc    Get lesson plans (list with filters)
 * @route   GET /api/lessons
 * @access  Private (Teacher sees own; Admin sees school)
 */
export const getLessonPlans = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, class: classId, subject, startDate, endDate, academicYear } = req.query;
    const query = {};

    if (req.user.role === 'teacher') {
        query.teacher = req.user._id;
    }
    if (classId) query.class = classId;
    if (subject) query.subject = subject;
    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = new Date(startDate);
        if (endDate) query.date.$lte = new Date(endDate);
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const lessons = await LessonPlan.find(query)
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName')
        .populate('standardIds', 'code name')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
        .lean();

    const total = await LessonPlan.countDocuments(query);

    res.json({
        success: true,
        data: {
            lessons,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                pages: Math.ceil(total / Math.max(1, parseInt(limit, 10)))
            }
        }
    });
});

/**
 * @desc    Get single lesson plan
 * @route   GET /api/lessons/:id
 * @access  Private
 */
export const getLessonPlanById = asyncHandler(async (req, res) => {
    const lesson = await LessonPlan.findById(req.params.id)
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName')
        .populate('standardIds', 'code name');

    if (!lesson) {
        return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    if (lesson.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'teacher' && lesson.teacher._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    res.json({ success: true, data: { lesson } });
});

/**
 * @desc    Create lesson plan
 * @route   POST /api/lessons
 * @access  Private (Teacher, Admin)
 */
export const createLessonPlan = asyncHandler(async (req, res) => {
    const body = req.body;
    const classId = body.class || body.classId;
    const subjectId = body.subject || body.subjectId;
    if (!classId || !subjectId || !body.date || !body.title) {
        return res.status(400).json({
            success: false,
            message: 'class, subject, date, and title are required'
        });
    }

    const doc = {
        school: req.schoolId,
        teacher: req.user._id,
        class: classId,
        subject: subjectId,
        date: new Date(body.date),
        title: body.title.trim(),
        summary: body.summary ?? '',
        description: body.description ?? '',
        homework: body.homework ?? '',
        previousKnowledge: body.previousKnowledge ?? '',
        teachingObjectives: body.teachingObjectives ?? '',
        vocabulary: body.vocabulary ?? '',
        characterTraitLinks: body.characterTraitLinks ?? '',
        techIntegration: body.techIntegration ?? '',
        standardIds: Array.isArray(body.standardIds) ? body.standardIds : [],
        stages: Array.isArray(body.stages) ? body.stages.map(s => ({
            name: s.name ?? '',
            procedure: s.procedure ?? '',
            materials: s.materials ?? '',
            timing: s.timing ?? ''
        })) : []
    };

    const lesson = await LessonPlan.create(doc);
    const populated = await LessonPlan.findById(lesson._id)
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName')
        .populate('standardIds', 'code name')
        .lean();

    res.status(201).json({ success: true, data: { lesson: populated } });
});

/**
 * @desc    Update lesson plan
 * @route   PUT /api/lessons/:id
 * @access  Private (Teacher, Admin)
 */
export const updateLessonPlan = asyncHandler(async (req, res) => {
    const existing = await LessonPlan.findById(req.params.id);
    if (!existing) {
        return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    if (existing.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'teacher' && existing.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const body = req.body;
    const allowed = [
        'class', 'subject', 'date', 'title', 'summary', 'description', 'homework',
        'previousKnowledge', 'teachingObjectives', 'vocabulary', 'characterTraitLinks', 'techIntegration', 'standardIds', 'stages'
    ];
    for (const key of allowed) {
        if (body[key] === undefined) continue;
        if (key === 'date') existing.date = new Date(body.date);
        else if (key === 'class') existing.class = body.class || body.classId;
        else if (key === 'subject') existing.subject = body.subject || body.subjectId;
        else if (key === 'title') existing.title = (body.title || '').trim();
        else if (key === 'standardIds' && Array.isArray(body.standardIds)) {
            existing.standardIds = body.standardIds;
        } else if (key === 'stages' && Array.isArray(body.stages)) {
            existing.stages = body.stages.map(s => ({
                name: s.name ?? '',
                procedure: s.procedure ?? '',
                materials: s.materials ?? '',
                timing: s.timing ?? ''
            }));
        } else if (typeof body[key] === 'string') {
            existing[key] = body[key];
        }
    }

    await existing.save();
    const lesson = await LessonPlan.findById(existing._id)
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName')
        .populate('standardIds', 'code name')
        .lean();

    res.json({ success: true, data: { lesson } });
});

/**
 * @desc    AI suggest content for a lesson plan field
 * @route   POST /api/lessons/ai/suggest
 * @access  Private (Teacher, Admin)
 */
export const suggestField = asyncHandler(async (req, res) => {
    const {
        field,
        currentValue,
        subjectId,
        classId,
        title,
        summary,
        stageIndex,
        stageProcedure
    } = req.body;
    const schoolId = req.schoolId;
    const userId = req.user?._id;

    if (!VALID_SUGGEST_FIELDS.includes(field)) {
        return res.status(400).json({ success: false, message: 'Invalid field for suggestion' });
    }
    if (!subjectId || !classId) {
        return res.status(400).json({ success: false, message: 'Class and Subject are required' });
    }

    const cls = await Class.findById(classId).lean();
    const subj = await Subject.findById(subjectId).lean();
    if (!cls || !subj) {
        return res.status(404).json({ success: false, message: 'Class or Subject not found' });
    }

    const actualValue = field === 'stageProcedure' ? (stageProcedure || currentValue || '') : (currentValue || '');

    const result = await lessonPlanAIService.suggestFieldContent({
        field,
        currentValue: actualValue,
        context: {
            subjectName: subj.name || '',
            gradeLevel: cls.grade ?? '',
            title: title || '',
            summary: summary || '',
            stageIndex
        }
    });

    if (schoolId && userId) {
        await AITokenUsage.create({
            model: MODEL_NAME,
            feature: 'lesson_plan_suggest',
            school: schoolId,
            user: userId,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
            totalTokens: result.tokenUsage.total,
            schoolId: schoolId.toString(),
            metadata: { field, subjectId, classId }
        });
    }

    res.json({
        success: true,
        data: { suggestion: result.text, tokenUsage: result.tokenUsage }
    });
});

/**
 * @desc    AI detect standards aligned with lesson content
 * @route   POST /api/lessons/ai/detect-standards
 * @access  Private (Teacher, Admin)
 */
export const detectStandards = asyncHandler(async (req, res) => {
    const { subjectId, classId, lessonText } = req.body;
    const schoolId = req.schoolId;
    const userId = req.user?._id;

    if (!subjectId || !classId) {
        return res.status(400).json({ success: false, message: 'Class and Subject are required' });
    }

    const cls = await Class.findById(classId).lean();
    const subj = await Subject.findById(subjectId).lean();
    if (!cls || !subj) {
        return res.status(404).json({ success: false, message: 'Class or Subject not found' });
    }

    const gradeLevel = cls.grade ?? 1;
    const standards = await Standard.find({
        subject: subjectId,
        gradeLevel,
        isActive: true
    })
        .lean()
        .limit(50);

    const result = await lessonPlanAIService.detectStandardsFromContent({
        schoolId,
        subjectId,
        gradeLevel,
        lessonText: lessonText || '',
        standards
    });

    if (schoolId && userId && result.tokenUsage.total > 0) {
        await AITokenUsage.create({
            model: MODEL_NAME,
            feature: 'lesson_plan_detect_standards',
            school: schoolId,
            user: userId,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
            totalTokens: result.tokenUsage.total,
            schoolId: schoolId.toString(),
            metadata: { subjectId, classId }
        });
    }

    res.json({
        success: true,
        data: { standards: result.standards, tokenUsage: result.tokenUsage }
    });
});

/**
 * @desc    AI generate multiple lesson sections from title + context
 * @route   POST /api/lessons/ai/generate-section
 * @access  Private (Teacher, Admin)
 */
export const generateSection = asyncHandler(async (req, res) => {
    const { title, subjectId, classId, sourceFields } = req.body;
    const schoolId = req.schoolId;
    const userId = req.user?._id;

    if (!subjectId || !classId) {
        return res.status(400).json({ success: false, message: 'Class and Subject are required' });
    }

    const cls = await Class.findById(classId).lean();
    const subj = await Subject.findById(subjectId).lean();
    if (!cls || !subj) {
        return res.status(404).json({ success: false, message: 'Class or Subject not found' });
    }

    const result = await lessonPlanAIService.generateSection({
        title: title || '',
        context: { subjectName: subj.name || '', gradeLevel: cls.grade ?? '' },
        sourceFields: Array.isArray(sourceFields)
            ? sourceFields
            : ['summary', 'description', 'teachingObjectives', 'vocabulary']
    });

    if (schoolId && userId) {
        await AITokenUsage.create({
            model: MODEL_NAME,
            feature: 'lesson_plan_generate_section',
            school: schoolId,
            user: userId,
            inputTokens: result.tokenUsage.input,
            outputTokens: result.tokenUsage.output,
            totalTokens: result.tokenUsage.total,
            schoolId: schoolId.toString(),
            metadata: { subjectId, classId }
        });
    }

    res.json({
        success: true,
        data: { generated: result.generated, tokenUsage: result.tokenUsage }
    });
});

/**
 * @desc    Delete lesson plan
 * @route   DELETE /api/lessons/:id
 * @access  Private (Teacher, Admin)
 */
export const deleteLessonPlan = asyncHandler(async (req, res) => {
    const lesson = await LessonPlan.findById(req.params.id);
    if (!lesson) {
        return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    if (lesson.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'teacher' && lesson.teacher.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    await LessonPlan.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true });
});
