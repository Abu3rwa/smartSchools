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
import { sanitizeObjectiveText, isObjectiveTextDegenerate } from '../utils/sanitizeObjectiveText.js';
import { connectAi } from '../utils/connectAi.js';

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

const stripCodeFences = (value = '') => String(value || '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

const normalizeQuestion = (question, index) => {
    const questionType = String(question?.questionType || '').trim().toLowerCase() === 'short_answer'
        ? 'short_answer'
        : 'multiple_choice';
    const options = Array.isArray(question?.options)
        ? question.options.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
        : [];

    return {
        questionId: String(question?.questionId || `q${index + 1}`).trim(),
        questionText: String(question?.questionText || '').trim(),
        questionType,
        options: questionType === 'multiple_choice' ? options : [],
        correctAnswer: String(question?.correctAnswer || '').trim(),
        explanation: String(question?.explanation || '').trim(),
        studentAnswer: '',
        isCorrect: null,
        aiFeedback: '',
        answeredAt: null
    };
};

const buildSessionQuestionsPrompt = ({ objectiveName, subjectName, gradeLevel }) => `You are an expert teacher. Generate 5 practice questions to test a student's understanding of this learning objective.

Objective: ${objectiveName}
Subject: ${subjectName || 'General'}
Grade Level: ${gradeLevel || 'Not specified'}

Rules:
- 3 multiple_choice questions and 2 short_answer questions
- Questions must directly test the objective, not general knowledge
- Multiple choice: provide exactly 4 options (A, B, C, D); options must be plausible
- Provide the correct answer and a 1-2 sentence explanation for each question
- Language: English

Return ONLY a valid JSON array (no markdown fences):
[{
  "questionId": "q1",
  "questionText": "...",
  "questionType": "multiple_choice",
  "options": ["A...", "B...", "C...", "D..."],
  "correctAnswer": "A...",
  "explanation": "..."
}]`;

const buildShortAnswerGradingPrompt = ({ objectiveName, questionText, expectedAnswer, studentAnswer }) => `You are grading a student's short answer response.

Learning Objective: ${objectiveName}
Question: ${questionText}
Expected answer concept: ${expectedAnswer}
Student answered: ${studentAnswer}

Determine if the student's answer demonstrates understanding of the concept.
Be lenient on phrasing; focus on conceptual correctness.

Return ONLY valid JSON:
{ "isCorrect": true|false, "feedback": "1-2 sentence explanation suitable for a student" }`;

const normalizeMcqValue = (value = '') => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[a-d][\.)\-:]\s*/i, '');

const extractMcqLabel = (value = '') => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^[a-d]$/i.test(text)) return text.toUpperCase();
    const prefixed = text.match(/^([a-d])[\.)\-:]/i);
    if (prefixed?.[1]) return prefixed[1].toUpperCase();
    return '';
};

const isMultipleChoiceCorrect = (question = {}, studentAnswer = '') => {
    const options = Array.isArray(question?.options)
        ? question.options.map((item) => String(item || '').trim()).filter(Boolean)
        : [];

    const normalizedStudent = normalizeMcqValue(studentAnswer);
    const normalizedCorrect = normalizeMcqValue(question?.correctAnswer || '');
    if (normalizedStudent && normalizedCorrect && normalizedStudent === normalizedCorrect) {
        return true;
    }

    const studentLabel = extractMcqLabel(studentAnswer);
    const correctLabel = extractMcqLabel(question?.correctAnswer || '');
    if (studentLabel && correctLabel && studentLabel === correctLabel) {
        return true;
    }

    if (!options.length) return false;

    const indexToLabel = ['A', 'B', 'C', 'D'];
    const optionMatchIndex = options.findIndex((option) => normalizeMcqValue(option) === normalizedStudent);
    if (optionMatchIndex === -1) return false;

    if (correctLabel && indexToLabel[optionMatchIndex] === correctLabel) {
        return true;
    }

    const correctOptionIndex = options.findIndex((option) => normalizeMcqValue(option) === normalizedCorrect);
    return correctOptionIndex !== -1 && correctOptionIndex === optionMatchIndex;
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

export const studentStartInteractiveSession = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can start AI interactive sessions' });
    }

    if (!mongoose.isValidObjectId(req.params.taskId)) {
        return res.status(400).json({ success: false, message: 'Invalid task ID format' });
    }

    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const task = await AcademicExcellenceTask
        .findOne({ _id: req.params.taskId, school: req.schoolId, student: student._id })
        .select('+aiSession.questions.correctAnswer +aiSession.questions.explanation');

    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (task.taskType !== 'ai_interactive') {
        return res.status(400).json({ success: false, message: 'Task is not an AI interactive session' });
    }
    if (task.status === 'completed') {
        return res.status(400).json({ success: false, message: 'This task has already been completed' });
    }

    const objectiveName = sanitizeObjectiveText(task.objectiveName || task.objectiveKey || '');
    if (isObjectiveTextDegenerate(objectiveName)) {
        return res.status(422).json({
            success: false,
            message: 'Objective text is not specific enough to generate an interactive session.'
        });
    }

    const subjectName = String(task.subject?.name || req.body?.subjectName || 'General').trim();
    const gradeLevel = student.currentClass?.grade || '';

    const aiResult = await connectAi(buildSessionQuestionsPrompt({ objectiveName, subjectName, gradeLevel }));
    let parsedQuestions;
    try {
        parsedQuestions = JSON.parse(stripCodeFences(aiResult.text));
    } catch {
        return res.status(502).json({ success: false, message: 'AI returned invalid session questions format.' });
    }

    const normalizedQuestions = Array.isArray(parsedQuestions)
        ? parsedQuestions.map((question, index) => normalizeQuestion(question, index)).filter((question) => question.questionText && question.correctAnswer)
        : [];

    if (normalizedQuestions.length === 0) {
        return res.status(502).json({ success: false, message: 'AI did not generate usable session questions.' });
    }

    task.aiSession = {
        questions: normalizedQuestions,
        sessionScore: null,
        sessionCompleted: false,
        sessionCompletedAt: null,
        currentQuestionIndex: 0
    };
    task.status = 'in_progress';
    task.startedAt = task.startedAt || new Date();
    await task.save();

    const safeQuestions = normalizedQuestions.map((question) => ({
        questionId: question.questionId,
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options
    }));

    return res.status(200).json({
        success: true,
        data: {
            taskId: task._id,
            questions: safeQuestions,
            currentQuestionIndex: 0
        }
    });
});

export const studentAnswerInteractiveSession = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can submit answers' });
    }

    const { questionId, studentAnswer } = req.body || {};
    if (!questionId || !String(studentAnswer || '').trim()) {
        return res.status(400).json({ success: false, message: 'questionId and studentAnswer are required' });
    }

    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const task = await AcademicExcellenceTask
        .findOne({ _id: req.params.taskId, school: req.schoolId, student: student._id })
        .select('+aiSession.questions.correctAnswer +aiSession.questions.explanation');

    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (task.taskType !== 'ai_interactive') {
        return res.status(400).json({ success: false, message: 'Task is not an AI interactive session' });
    }
    if (task.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: 'Interactive session is not in progress' });
    }

    const questions = task.aiSession?.questions || [];
    const index = questions.findIndex((question) => String(question.questionId) === String(questionId));
    if (index === -1) {
        return res.status(404).json({ success: false, message: 'Question not found in session' });
    }

    const targetQuestion = questions[index];
    const normalizedStudentAnswer = String(studentAnswer || '').trim();
    let isCorrect = false;
    let aiFeedback = '';

    if (targetQuestion.questionType === 'multiple_choice') {
        isCorrect = isMultipleChoiceCorrect(targetQuestion, normalizedStudentAnswer);
        aiFeedback = isCorrect
            ? 'Great work. You selected the correct answer.'
            : 'Not quite yet. Review the explanation and try to understand the concept.';
    } else {
        const objectiveName = sanitizeObjectiveText(task.objectiveName || task.objectiveKey || '');
        const aiResult = await connectAi(buildShortAnswerGradingPrompt({
            objectiveName,
            questionText: targetQuestion.questionText,
            expectedAnswer: targetQuestion.correctAnswer,
            studentAnswer: normalizedStudentAnswer
        }));

        try {
            const parsed = JSON.parse(stripCodeFences(aiResult.text));
            isCorrect = Boolean(parsed?.isCorrect);
            aiFeedback = String(parsed?.feedback || '').trim();
        } catch {
            isCorrect = false;
            aiFeedback = 'Your answer was recorded, but automatic grading had an issue. Please review the explanation.';
        }
    }

    targetQuestion.studentAnswer = normalizedStudentAnswer;
    targetQuestion.isCorrect = isCorrect;
    targetQuestion.aiFeedback = aiFeedback;
    targetQuestion.answeredAt = new Date();
    task.aiSession.currentQuestionIndex = Math.max(Number(task.aiSession.currentQuestionIndex || 0), index + 1);
    await task.save();

    return res.status(200).json({
        success: true,
        data: {
            isCorrect,
            correctAnswer: targetQuestion.correctAnswer,
            explanation: targetQuestion.explanation,
            aiFeedback
        }
    });
});

export const studentCompleteInteractiveSession = asyncHandler(async (req, res) => {
    if (req.user.role !== 'student') {
        return res.status(403).json({ success: false, message: 'Only students can complete interactive sessions' });
    }

    const student = await loadStudentForRequest(req);
    const access = await enforceStudentResourceAccess(req, student);
    if (!access.allowed) {
        return res.status(access.status).json({ success: false, message: access.message });
    }

    const task = await AcademicExcellenceTask
        .findOne({ _id: req.params.taskId, school: req.schoolId, student: student._id })
        .select('+aiSession.questions.correctAnswer +aiSession.questions.explanation');

    if (!task) {
        return res.status(404).json({ success: false, message: 'Task not found' });
    }
    if (task.taskType !== 'ai_interactive') {
        return res.status(400).json({ success: false, message: 'Task is not an AI interactive session' });
    }

    const questions = task.aiSession?.questions || [];
    if (questions.length === 0) {
        return res.status(400).json({ success: false, message: 'Session has no generated questions' });
    }

    const answered = questions.filter((question) => question.answeredAt);
    const correctCount = answered.filter((question) => question.isCorrect === true).length;
    const totalCount = questions.length;
    const sessionScore = Math.round((correctCount / totalCount) * 100);

    task.aiSession.sessionScore = sessionScore;
    task.aiSession.sessionCompleted = true;
    task.aiSession.sessionCompletedAt = new Date();
    task.status = 'completed';
    task.startedAt = task.startedAt || new Date();
    task.completedAt = new Date();
    task.studentScore = sessionScore;
    await task.save();

    if (task.objectiveRef) {
        const objectiveDoc = await AcademicExcellenceObjective.findById(task.objectiveRef);
        if (objectiveDoc) {
            objectiveDoc.practiceTasksCompleted = Number(objectiveDoc.practiceTasksCompleted || 0) + 1;
            objectiveDoc.lastPracticeDate = new Date();
            objectiveDoc.totalPracticeMinutes = Number(objectiveDoc.totalPracticeMinutes || 0) + Number(task.estimatedMinutes || 0);
            await objectiveDoc.save();
        }
    }

    return res.status(200).json({
        success: true,
        data: {
            sessionScore,
            correctCount,
            totalCount,
            masteryHint: sessionScore >= 80
                ? "Great job! You're on track to mastering this objective."
                : 'Keep practicing - review the explanations and try again.'
        }
    });
});

export default {
    getStudentAcademicExcellenceDashboard,
    getStudentObjectivesList,
    getStudentTasks,
    studentCompleteTask,
    studentStartInteractiveSession,
    studentAnswerInteractiveSession,
    studentCompleteInteractiveSession
};
