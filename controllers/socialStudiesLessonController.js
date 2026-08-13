import SocialStudiesLesson from '../models/SocialStudiesLesson.js';
import SocialStudiesUnit from '../models/SocialStudiesUnit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile } from '../helpers/teacherScoping.js';
import { connectAi } from '../utils/connectAi.js';
import logger from '../utils/logger.js';

// ── AI helpers ────────────────────────────────────────────────────────────
const stripHtml = (html = '') => String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();

const stripCodeFences = (value = '') => String(value || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

const buildGenerateQuestionsPrompt = ({ lessonText, count, difficulty, questionTypes }) => {
    const typeDescriptions = questionTypes.map(t => {
        if (t === 'multiple_choice') return '- multiple_choice: 4 options labeled A/B/C/D, correctAnswer is the label e.g. "A"';
        if (t === 'true_false') return '- true_false: no options array, correctAnswer is exactly "True" or "False"';
        if (t === 'short_answer') return '- short_answer: no options array, correctAnswer is a concise model answer';
        return '';
    }).join('\n');

    return `You are a Social Studies teacher creating assessment questions for students.

LESSON CONTENT:
"""
${lessonText.slice(0, 4000)}
"""

Generate exactly ${count} questions from the lesson content above.
Difficulty level: ${difficulty}
Question types to use (distribute evenly if multiple): ${questionTypes.join(', ')}

${typeDescriptions}

Rules:
- Questions must be directly based on the lesson content
- Do not invent facts not in the lesson
- Explanations should reinforce the learning
- Points: easy=1, medium=1, hard=2

Return ONLY a valid JSON array with no extra text:
[
  {
    "questionText": "...",
    "questionType": "multiple_choice|true_false|short_answer",
    "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
    "correctAnswer": "A",
    "explanation": "...",
    "difficulty": "${difficulty}",
    "points": 1
  }
]`;
};

// ── Question sanitizer ────────────────────────────────────────────────────
const sanitizeQuestion = (q) => {
    if (!q?.questionText?.trim()) return null;
    if (!['multiple_choice', 'true_false', 'short_answer'].includes(q.questionType)) return null;
    return {
        questionText: q.questionText.trim(),
        questionType: q.questionType,
        options: Array.isArray(q.options)
            ? q.options.map(o => ({ label: String(o.label || '').trim(), text: String(o.text || '').trim() }))
            : [],
        correctAnswer: (q.correctAnswer || '').trim(),
        explanation: (q.explanation || '').trim(),
        difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
        points: Number(q.points ?? 1) || 1,
        topic: (q.topic || '').trim(),
        isAIGenerated: Boolean(q.isAIGenerated),
        isActive: q.isActive !== false,
    };
};

// GET /api/social-studies/lessons?unitId=...
export const getLessons = asyncHandler(async (req, res) => {
    const { unitId } = req.query;
    if (!unitId) return res.status(400).json({ success: false, message: 'unitId is required' });

    const lessons = await SocialStudiesLesson.find({ school: req.schoolId, unit: unitId, isActive: true })
        .select('-questions -content')
        .sort({ order: 1, createdAt: 1 })
        .lean();

    res.json({ success: true, data: lessons });
});

// GET /api/social-studies/lessons/:id  (full, for teacher editor)
export const getLesson = asyncHandler(async (req, res) => {
    const lesson = await SocialStudiesLesson.findById(req.params.id).lean();
    if (!lesson || !lesson.isActive) return res.status(404).json({ success: false, message: 'Lesson not found' });
    res.json({ success: true, data: lesson });
});

// GET /api/social-studies/lessons/:id/student  (published only, strips correct answers)
export const getLessonForStudent = asyncHandler(async (req, res) => {
    const lesson = await SocialStudiesLesson.findById(req.params.id).lean();
    if (!lesson || !lesson.isActive || !lesson.isPublished) {
        return res.status(404).json({ success: false, message: 'Lesson not found' });
    }
    const safe = {
        ...lesson,
        questions: (lesson.questions || [])
            .filter(q => q.isActive !== false)
            .map(({ correctAnswer, explanation, ...q }) => q),
    };
    res.json({ success: true, data: safe });
});

// POST /api/social-studies/lessons
export const createLesson = asyncHandler(async (req, res) => {
    const { unitId, title, estimatedDuration, order, content, questions } = req.body;

    if (!unitId) return res.status(400).json({ success: false, message: 'unitId is required' });
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'title is required' });

    const unit = await SocialStudiesUnit.findById(unitId).lean();
    if (!unit) return res.status(404).json({ success: false, message: 'Unit not found' });

    const teacher = await resolveTeacherProfile(req);

    const lesson = await SocialStudiesLesson.create({
        school: req.schoolId,
        teacher: teacher?._id || req.user._id,
        unit: unitId,
        title: title.trim(),
        estimatedDuration: estimatedDuration ? Number(estimatedDuration) : null,
        order: order != null ? Number(order) : 0,
        content: content || '',
        questions: Array.isArray(questions) ? questions.map(sanitizeQuestion).filter(Boolean) : [],
    });

    res.status(201).json({ success: true, data: lesson });
});

// PUT /api/social-studies/lessons/:id
export const updateLesson = asyncHandler(async (req, res) => {
    const { title, estimatedDuration, order, content, questions, isPublished } = req.body;

    const lesson = await SocialStudiesLesson.findById(req.params.id);
    if (!lesson || !lesson.isActive) return res.status(404).json({ success: false, message: 'Lesson not found' });

    if (title != null) lesson.title = title.trim();
    if (estimatedDuration != null) lesson.estimatedDuration = Number(estimatedDuration);
    if (order != null) lesson.order = Number(order);
    if (typeof isPublished === 'boolean') lesson.isPublished = isPublished;
    if (content != null) lesson.content = content;
    if (Array.isArray(questions)) {
        lesson.questions = questions.map(sanitizeQuestion).filter(Boolean);
    }

    await lesson.save();
    res.json({ success: true, data: lesson });
});

// DELETE /api/social-studies/lessons/:id
export const deleteLesson = asyncHandler(async (req, res) => {
    const lesson = await SocialStudiesLesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    lesson.isActive = false;
    await lesson.save();
    res.json({ success: true, message: 'Lesson deleted' });
});

// POST /api/social-studies/lessons/:id/generate-questions  (AI — teacher only)
export const generateQuestionsFromLesson = asyncHandler(async (req, res) => {
    const lesson = await SocialStudiesLesson.findById(req.params.id).lean();
    if (!lesson || !lesson.isActive) return res.status(404).json({ success: false, message: 'Lesson not found' });

    const lessonText = stripHtml(lesson.content || '');
    if (lessonText.length < 50) {
        return res.status(400).json({ success: false, message: 'Lesson content is too short to generate questions. Add content first.' });
    }

    const count = Math.min(Math.max(Number(req.body.count) || 5, 1), 15);
    const difficulty = ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'medium';
    const rawTypes = Array.isArray(req.body.questionTypes) ? req.body.questionTypes : ['multiple_choice', 'true_false'];
    const questionTypes = rawTypes.filter(t => ['multiple_choice', 'true_false', 'short_answer'].includes(t));
    const effectiveTypes = questionTypes.length > 0 ? questionTypes : ['multiple_choice', 'true_false'];

    const prompt = buildGenerateQuestionsPrompt({ lessonText, count, difficulty, questionTypes: effectiveTypes });

    let aiResult;
    try {
        aiResult = await connectAi(prompt);
    } catch (err) {
        logger.warn('social_studies_ai_generate_failed', { err: err.message });
        return res.status(502).json({ success: false, message: 'AI service is temporarily unavailable. Please try again.' });
    }

    let parsed;
    try {
        parsed = JSON.parse(stripCodeFences(aiResult.text));
    } catch {
        return res.status(502).json({ success: false, message: 'AI returned an unexpected format. Please try again.' });
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
        return res.status(502).json({ success: false, message: 'AI did not return usable questions. Please try again.' });
    }

    // Normalize the AI response into our question schema
    const questions = parsed
        .filter(q => q?.questionText?.trim())
        .map(q => ({
            questionText: String(q.questionText || '').trim(),
            questionType: ['multiple_choice', 'true_false', 'short_answer'].includes(q.questionType)
                ? q.questionType : 'multiple_choice',
            options: Array.isArray(q.options)
                ? q.options.map(o => ({ label: String(o.label || '').trim(), text: String(o.text || '').trim() })).filter(o => o.text)
                : [],
            correctAnswer: String(q.correctAnswer || '').trim(),
            explanation: String(q.explanation || '').trim(),
            difficulty,
            points: Number(q.points) >= 1 ? Number(q.points) : 1,
            isAIGenerated: true,
            isActive: true,
        }))
        .slice(0, count);

    res.json({ success: true, data: questions });
});
