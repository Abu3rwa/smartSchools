import LessonPlan from '../models/LessonPlan.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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
        .populate('teacher', 'firstName lastName');

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
        'previousKnowledge', 'teachingObjectives', 'vocabulary', 'characterTraitLinks', 'techIntegration', 'stages'
    ];
    for (const key of allowed) {
        if (body[key] === undefined) continue;
        if (key === 'date') existing.date = new Date(body.date);
        else if (key === 'class') existing.class = body.class || body.classId;
        else if (key === 'subject') existing.subject = body.subject || body.subjectId;
        else if (key === 'title') existing.title = (body.title || '').trim();
        else if (key === 'stages' && Array.isArray(body.stages)) {
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
        .lean();

    res.json({ success: true, data: { lesson } });
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
