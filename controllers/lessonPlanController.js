import LessonPlan from '../models/LessonPlan.js';
import LessonPlanCriteria from '../models/LessonPlanCriteria.js';
import Class from '../models/Class.js';
import Subject from '../models/Subject.js';
import Standard from '../models/Standard.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as lessonPlanAIService from '../services/lessonPlanAIService.js';
import * as lessonPlanEvaluationService from '../services/lessonPlanEvaluationService.js';
import { sendLessonPlanFeedback } from '../services/emailService.js';

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
    const effectiveAcademicYear = academicYear || req.academicYear;
    const query = {};

    // Check if user can view all lesson plans
    const canViewAll = req.user.role === 'admin' || 
                       req.user.role === 'department_principal' ||
                       req.user.permissions?.includes('review_lesson_plans');

    // Teachers without review permission only see their own plans
    if (req.user.role === 'teacher' && !canViewAll) {
        query.teacher = req.user._id;
    }
    
    let departmentClassIds = null;
    if (req.departmentId) {
        departmentClassIds = await Class.find({ school: req.schoolId, department: req.departmentId }).select('_id').lean();
        query.class = departmentClassIds.length ? { $in: departmentClassIds.map((c) => c._id) } : { $in: [] };
    }
    if (classId) {
        if (req.departmentId && departmentClassIds && !departmentClassIds.some((c) => c._id.toString() === classId)) {
            query.class = { $in: [] }; // class not in department: no results
        } else {
            query.class = classId;
        }
    }

    if (effectiveAcademicYear) {
        const yearClasses = await Class.find({
            school: req.schoolId,
            academicYear: effectiveAcademicYear,
        }).select('_id').lean();
        const yearClassIdSet = new Set(yearClasses.map((item) => item._id.toString()));

        if (classId) {
            if (!yearClassIdSet.has(classId.toString())) {
                query.class = { $in: [] };
            }
        } else if (query.class?.$in) {
            const scopedIds = query.class.$in
                .map((item) => item.toString())
                .filter((id) => yearClassIdSet.has(id));
            query.class = { $in: scopedIds };
        } else {
            query.class = { $in: Array.from(yearClassIdSet) };
        }
    }

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
    
    // Check if user can view all lesson plans
    const canViewAll = req.user.role === 'admin' || 
                       req.user.role === 'department_principal' ||
                       req.user.permissions?.includes('review_lesson_plans');
    
    // Teachers without review permission can only view their own plans
    if (req.user.role === 'teacher' && !canViewAll && lesson.teacher._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (req.departmentId) {
        const cls = await Class.findById(lesson.class?._id || lesson.class).select('department').lean();
        if (!cls?.department || cls.department.toString() !== req.departmentId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
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
        sourceFields: Array.isArray(sourceFields) ? sourceFields : undefined
    });

    let standards = [];
    const generated = result.generated || {};
    const lessonText = [
        title || '',
        generated.summary || '',
        generated.description || '',
        generated.teachingObjectives || ''
    ].filter(Boolean).join('\n\n');

    if (lessonText.trim()) {
        const gradeLevel = cls.grade ?? 1;
        const standardsList = await Standard.find({
            school: schoolId,
            subject: subjectId,
            gradeLevel,
            isActive: true
        })
            .lean()
            .limit(50);

        if (standardsList.length > 0) {
            const detectResult = await lessonPlanAIService.detectStandardsFromContent({
                schoolId,
                subjectId,
                gradeLevel,
                lessonText,
                standards: standardsList
            });
            standards = detectResult.standards || [];
            if (detectResult.tokenUsage?.total > 0 && schoolId && userId) {
                await AITokenUsage.create({
                    model: MODEL_NAME,
                    feature: 'lesson_plan_detect_standards',
                    school: schoolId,
                    user: userId,
                    inputTokens: detectResult.tokenUsage.input,
                    outputTokens: detectResult.tokenUsage.output,
                    totalTokens: detectResult.tokenUsage.total,
                    schoolId: schoolId.toString(),
                    metadata: { subjectId, classId, fromGenerate: true }
                });
            }
        }
    }

    if (schoolId && userId && result.tokenUsage?.total > 0) {
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
        data: {
            generated: result.generated,
            standards,
            tokenUsage: result.tokenUsage
        }
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

/**
 * @desc    Submit lesson plan for AI evaluation
 * @route   POST /api/lessons/:id/submit
 * @access  Private (Teacher)
 */
export const submitLessonPlan = asyncHandler(async (req, res) => {
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
    
    if (lesson.status !== 'draft' && lesson.status !== 'needs_revision') {
        return res.status(400).json({ 
            success: false, 
            message: 'Only draft or needs_revision lesson plans can be submitted' 
        });
    }

    const criteria = await LessonPlanCriteria.find({ 
        school: req.schoolId, 
        isActive: true 
    }).sort({ order: 1 });

    if (criteria.length === 0) {
        lesson.status = 'submitted';
        lesson.submittedAt = new Date();
        await lesson.save();
        
        return res.json({ 
            success: true, 
            message: 'Lesson plan submitted. No evaluation criteria configured.',
            data: { lesson }
        });
    }

    lesson.status = 'submitted';
    lesson.submittedAt = new Date();
    await lesson.save();

    try {
        const evaluation = await lessonPlanEvaluationService.evaluateLessonPlan(lesson._id, criteria);
        
        const updatedLesson = await LessonPlan.findById(lesson._id)
            .populate('class', 'name')
            .populate('subject', 'name')
            .populate('teacher', 'firstName lastName email')
            .populate('standardIds', 'code name');

        if (!evaluation.meetsMinimumRequirements) {
            await sendLessonPlanFeedback(updatedLesson, updatedLesson.teacher);
        }

        res.json({ 
            success: true, 
            message: 'Lesson plan submitted and evaluated successfully',
            data: { 
                lesson: updatedLesson,
                evaluation: updatedLesson.aiEvaluation
            }
        });
    } catch (error) {
        lesson.status = 'draft';
        lesson.submittedAt = null;
        await lesson.save();
        
        throw error;
    }
});

/**
 * @desc    Get lesson plans for admin review
 * @route   GET /api/lessons/admin/review
 * @access  Private (Admin, Department Principal)
 */
export const getLessonPlansForReview = asyncHandler(async (req, res) => {
    const { 
        page = 1, 
        limit = 20, 
        status, 
        teacher, 
        subject, 
        startDate, 
        endDate,
        meetsRequirements 
    } = req.query;

    const query = { school: req.schoolId };

    if (status) {
        query.status = status;
    } else {
        query.status = { $in: ['submitted', 'needs_revision', 'approved', 'rejected'] };
    }

    if (teacher) query.teacher = teacher;
    if (subject) query.subject = subject;
    
    if (startDate || endDate) {
        query.submittedAt = {};
        if (startDate) query.submittedAt.$gte = new Date(startDate);
        if (endDate) query.submittedAt.$lte = new Date(endDate);
    }

    if (meetsRequirements !== undefined) {
        query['aiEvaluation.meetsMinimumRequirements'] = meetsRequirements === 'true';
    }

    if (req.departmentId) {
        const departmentClassIds = await Class.find({ 
            school: req.schoolId, 
            department: req.departmentId 
        }).select('_id').lean();
        
        if (departmentClassIds.length > 0) {
            query.class = { $in: departmentClassIds.map(c => c._id) };
        } else {
            query.class = { $in: [] };
        }
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    
    const lessons = await LessonPlan.find(query)
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName email')
        .populate('humanReview.reviewedBy', 'firstName lastName')
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(Math.min(100, Math.max(1, parseInt(limit, 10))))
        .lean();

    const total = await LessonPlan.countDocuments(query);

    const stats = await LessonPlan.aggregate([
        { $match: { school: req.schoolId, status: { $ne: 'draft' } } },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const statusCounts = stats.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
    }, {});

    res.json({
        success: true,
        data: {
            lessons,
            pagination: {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                total,
                pages: Math.ceil(total / Math.max(1, parseInt(limit, 10)))
            },
            stats: statusCounts
        }
    });
});

/**
 * @desc    Admin review lesson plan
 * @route   POST /api/lessons/:id/review
 * @access  Private (Admin, Department Principal)
 */
export const reviewLessonPlan = asyncHandler(async (req, res) => {
    const { comments, finalStatus } = req.body;
    
    if (!finalStatus || !['approved', 'needs_revision', 'rejected'].includes(finalStatus)) {
        return res.status(400).json({ 
            success: false, 
            message: 'Valid finalStatus (approved, needs_revision, rejected) is required' 
        });
    }

    const lesson = await LessonPlan.findById(req.params.id);
    
    if (!lesson) {
        return res.status(404).json({ success: false, message: 'Lesson plan not found' });
    }
    
    if (lesson.school.toString() !== req.schoolId.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (req.departmentId) {
        const cls = await Class.findById(lesson.class).select('department').lean();
        if (!cls?.department || cls.department.toString() !== req.departmentId.toString()) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
    }

    lesson.humanReview = {
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        comments: comments || '',
        finalStatus
    };
    
    lesson.status = finalStatus;
    await lesson.save();

    const updatedLesson = await LessonPlan.findById(lesson._id)
        .populate('class', 'name')
        .populate('subject', 'name')
        .populate('teacher', 'firstName lastName email')
        .populate('humanReview.reviewedBy', 'firstName lastName');

    res.json({ 
        success: true, 
        message: 'Lesson plan reviewed successfully',
        data: { lesson: updatedLesson }
    });
});

/**
 * @desc    Get lesson plan statistics
 * @route   GET /api/lessons/stats
 * @access  Private (Admin, Department Principal)
 */
export const getLessonPlanStats = asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const query = { school: req.schoolId };

    if (startDate || endDate) {
        query.submittedAt = {};
        if (startDate) query.submittedAt.$gte = new Date(startDate);
        if (endDate) query.submittedAt.$lte = new Date(endDate);
    }

    if (req.departmentId) {
        const departmentClassIds = await Class.find({ 
            school: req.schoolId, 
            department: req.departmentId 
        }).select('_id').lean();
        
        if (departmentClassIds.length > 0) {
            query.class = { $in: departmentClassIds.map(c => c._id) };
        }
    }

    const [statusStats, avgScores, teacherStats] = await Promise.all([
        LessonPlan.aggregate([
            { $match: query },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]),
        LessonPlan.aggregate([
            { $match: { ...query, 'aiEvaluation.overallScore': { $exists: true } } },
            {
                $group: {
                    _id: null,
                    avgScore: { $avg: '$aiEvaluation.overallScore' },
                    minScore: { $min: '$aiEvaluation.overallScore' },
                    maxScore: { $max: '$aiEvaluation.overallScore' }
                }
            }
        ]),
        LessonPlan.aggregate([
            { $match: { ...query, status: { $ne: 'draft' } } },
            {
                $group: {
                    _id: '$teacher',
                    submitted: { $sum: 1 },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    },
                    avgScore: { $avg: '$aiEvaluation.overallScore' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'teacherInfo'
                }
            },
            {
                $unwind: {
                    path: '$teacherInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $project: {
                    teacherId: '$_id',
                    teacherName: {
                        $trim: {
                            input: {
                                $concat: [
                                    { $ifNull: ['$teacherInfo.firstName', ''] },
                                    ' ',
                                    { $ifNull: ['$teacherInfo.lastName', ''] }
                                ]
                            }
                        }
                    },
                    submitted: 1,
                    approved: 1,
                    avgScore: 1
                }
            },
            { $sort: { submitted: -1 } },
            { $limit: 10 }
        ])
    ]);

    res.json({
        success: true,
        data: {
            statusBreakdown: statusStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            averageScores: avgScores[0] || { avgScore: 0, minScore: 0, maxScore: 0 },
            topTeachers: teacherStats
        }
    });
});
