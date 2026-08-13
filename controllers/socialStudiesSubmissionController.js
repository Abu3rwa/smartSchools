import SocialStudiesSubmission from '../models/SocialStudiesSubmission.js';
import SocialStudiesAssignment from '../models/SocialStudiesAssignment.js';
import Grade from '../models/Grade.js';
import Student from '../models/Student.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveSemesterForDate } from '../services/gradebookConfigService.js';
import notificationService from '../services/notificationService.js';
import logger from '../utils/logger.js';

// ── Auto-score questions ─────────────────────────────────────────────────
const scoreSubmission = (questions = [], answers = []) => {
    const answerMap = Object.fromEntries(answers.map(a => [String(a.questionId), a.answer]));
    let score = 0;
    const scoredAnswers = questions.map((q, index) => {
        const questionRef = q.questionId || q._id || `q-${index}`;
        const qId = String(questionRef);
        const studentAnswer = (answerMap[qId] || '').trim().toLowerCase();
        const points = Number(q.points) || 1;

        // short_answer: must be manually graded
        if (q.questionType === 'short_answer') {
            return { questionId: questionRef, answer: answerMap[qId] || '', isCorrect: null, pointsEarned: 0 };
        }

        const correct = (q.correctAnswer || '').trim().toLowerCase();
        const isCorrect = studentAnswer !== '' && studentAnswer === correct;
        if (isCorrect) score += points;

        return { questionId: questionRef, answer: answerMap[qId] || '', isCorrect, pointsEarned: isCorrect ? points : 0 };
    });

    const hasShortAnswer = questions.some(q => q.questionType === 'short_answer');
    return { scoredAnswers, score, hasShortAnswer };
};

// ── Create Grade record ──────────────────────────────────────────────────
const createGradeRecord = async ({ submission, assignment, schoolId, student }) => {
    const gradeTypeMap = { classwork: 'classwork', homework: 'homework', quiz: 'quiz' };
    const gradeType = gradeTypeMap[assignment.assignmentType] || 'classwork';

    const now = new Date();
    const semester = assignment.semester || (await resolveSemesterForDate(schoolId, now));

    const grade = await Grade.create({
        school: schoolId,
        student: student._id,
        subject: assignment.subject || assignment.class,
        class: assignment.class,
        teacher: assignment.teacher,
        academicYear: assignment.academicYear,
        semester,
        gradeType,
        category: gradeType,
        marks: submission.score,
        maxMarks: assignment.totalPoints || 1,
        title: assignment.title,
        description: `Social Studies – ${assignment.title}`,
        date: submission.submittedAt || now,
        month: (submission.submittedAt || now).getMonth() + 1,
    });

    return grade;
};

// POST /api/social-studies/submissions/start
export const startSubmission = asyncHandler(async (req, res) => {
    const { assignmentId } = req.body;
    if (!assignmentId) return res.status(400).json({ success: false, message: 'assignmentId is required' });

    const assignment = await SocialStudiesAssignment.findById(assignmentId).lean();
    if (!assignment || assignment.status !== 'published') {
        return res.status(404).json({ success: false, message: 'Assignment not found or not published' });
    }

    const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).lean();
    if (!student) return res.status(403).json({ success: false, message: 'Student record not found' });

    const isAssignedToStudent = assignment.class?.toString() === student.currentClass?.toString()
        && (
            assignment.scope === 'class'
            || (assignment.scope === 'selected_students'
                && Array.isArray(assignment.studentIds)
                && assignment.studentIds.some((id) => id.toString() === student._id.toString()))
        );

    if (!isAssignedToStudent) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Check availability window
    const now = new Date();
    if (assignment.availability?.startAt && now < new Date(assignment.availability.startAt)) {
        return res.status(403).json({ success: false, message: 'This assignment is not yet available' });
    }
    if (assignment.availability?.endAt && now > new Date(assignment.availability.endAt)) {
        return res.status(403).json({ success: false, message: 'This assignment has expired' });
    }

    // Resume an in-progress attempt before enforcing the maximum-attempt limit.
    const inProgress = await SocialStudiesSubmission.findOne({
        school: req.schoolId,
        student: student._id,
        assignment: assignmentId,
        status: 'in_progress',
    });
    if (inProgress) return res.json({ success: true, data: inProgress });

    // Check existing attempts for a new attempt.
    const existingCount = await SocialStudiesSubmission.countDocuments({
        school: req.schoolId,
        student: student._id,
        assignment: assignmentId,
    });

    if (existingCount >= (assignment.maxAttempts || 1)) {
        return res.status(400).json({ success: false, message: 'Maximum attempts reached' });
    }

    const submission = await SocialStudiesSubmission.create({
        school: req.schoolId,
        student: student._id,
        assignment: assignmentId,
        attempt: existingCount + 1,
        status: 'in_progress',
        totalPoints: assignment.totalPoints || 0,
        startedAt: new Date(),
    });

    res.status(201).json({ success: true, data: submission });
});

// PUT /api/social-studies/submissions/:id/submit
export const submitSubmission = asyncHandler(async (req, res) => {
    const { answers = [] } = req.body;

    const submission = await SocialStudiesSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (submission.status !== 'in_progress') {
        return res.status(400).json({ success: false, message: 'Submission already submitted' });
    }

    const assignment = await SocialStudiesAssignment.findById(submission.assignment).lean();
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const student = await Student.findById(submission.student).lean();

    const { scoredAnswers, score, hasShortAnswer } = scoreSubmission(assignment.questions, answers);

    const totalPoints = assignment.totalPoints || 1;
    const percentage = totalPoints > 0 ? Number(((score / totalPoints) * 100).toFixed(1)) : 0;

    submission.answers = scoredAnswers;
    submission.score = score;
    submission.totalPoints = totalPoints;
    submission.percentage = percentage;
    submission.status = hasShortAnswer ? 'submitted' : 'graded';
    submission.submittedAt = new Date();
    if (!hasShortAnswer) submission.gradedAt = new Date();

    // Create Grade record if fully auto-graded (no short_answer)
    if (!hasShortAnswer && student) {
        try {
            const gradeDoc = await createGradeRecord({
                submission,
                assignment,
                schoolId: req.schoolId,
                student,
            });
            submission.grade = gradeDoc._id;

            // Notify parent
            if (assignment.notifyParents) {
                try {
                    await notificationService.notifyStudentParent({
                        schoolId: req.schoolId,
                        studentId: student._id,
                        subject: `Social Studies result: ${assignment.title}`,
                        message: `${student.firstName} scored ${score}/${totalPoints} (${percentage}%) on "${assignment.title}".`,
                        type: 'grade',
                    });
                } catch (err) {
                    logger.warn('social_studies_parent_notify_failed', { err: err.message });
                }
            }
        } catch (err) {
            logger.warn('social_studies_grade_create_failed', { err: err.message });
        }
    }

    await submission.save();
    res.json({ success: true, data: submission });
});

// GET /api/social-studies/submissions/my  (student)
export const getMySubmissions = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ user: req.user._id, school: req.schoolId }).lean();
    if (!student) return res.json({ success: true, data: [] });

    const submissions = await SocialStudiesSubmission.find({
        school: req.schoolId,
        student: student._id,
    })
        .populate({
            path: 'assignment',
            select: 'title assignmentType dueDate unit lesson totalPoints',
            populate: [
                { path: 'unit', select: 'title' },
                { path: 'lesson', select: 'title' },
            ],
        })
        .sort({ submittedAt: -1 })
        .lean();

    res.json({ success: true, data: submissions });
});

// GET /api/social-studies/submissions/:id  (student or teacher)
export const getSubmission = asyncHandler(async (req, res) => {
    const submission = await SocialStudiesSubmission.findById(req.params.id)
        .populate('assignment')
        .populate('student', 'firstName lastName studentId')
        .lean();
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    res.json({ success: true, data: submission });
});

// PUT /api/social-studies/submissions/:id/grade  (teacher grades short_answer questions)
export const gradeSubmission = asyncHandler(async (req, res) => {
    const { questionGrades = [] } = req.body;
    // questionGrades: [{ questionId, pointsEarned }]

    const submission = await SocialStudiesSubmission.findById(req.params.id);
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (submission.status === 'in_progress') {
        return res.status(400).json({ success: false, message: 'Submission has not been submitted yet' });
    }

    const assignment = await SocialStudiesAssignment.findById(submission.assignment).lean();
    const student = await Student.findById(submission.student).lean();

    // Apply manual grades to short_answer answers
    const gradeMap = Object.fromEntries(questionGrades.map(g => [String(g.questionId), Number(g.pointsEarned) || 0]));
    let totalScore = 0;

    submission.answers = submission.answers.map(a => {
        const qId = String(a.questionId);
        if (qId in gradeMap) {
            return { ...a, pointsEarned: gradeMap[qId], isCorrect: gradeMap[qId] > 0 };
        }
        return a;
    });

    totalScore = submission.answers.reduce((acc, a) => acc + (Number(a.pointsEarned) || 0), 0);

    const totalPoints = assignment?.totalPoints || 1;
    submission.score = totalScore;
    submission.percentage = Number(((totalScore / totalPoints) * 100).toFixed(1));
    submission.status = 'graded';
    submission.gradedAt = new Date();
    submission.gradedBy = req.user._id;

    // Create or update Grade record
    if (student) {
        try {
            if (submission.grade) {
                await Grade.findByIdAndUpdate(submission.grade, {
                    marks: totalScore,
                    maxMarks: totalPoints,
                });
            } else {
                const gradeDoc = await createGradeRecord({
                    submission,
                    assignment,
                    schoolId: req.schoolId,
                    student,
                });
                submission.grade = gradeDoc._id;
            }

            // Notify parent
            if (assignment?.notifyParents) {
                try {
                    await notificationService.notifyStudentParent({
                        schoolId: req.schoolId,
                        studentId: student._id,
                        subject: `Social Studies graded: ${assignment.title}`,
                        message: `${student.firstName} scored ${totalScore}/${totalPoints} (${submission.percentage}%) on "${assignment.title}".`,
                        type: 'grade',
                    });
                } catch (err) {
                    logger.warn('social_studies_parent_notify_failed', { err: err.message });
                }
            }
        } catch (err) {
            logger.warn('social_studies_grade_update_failed', { err: err.message });
        }
    }

    await submission.save();
    res.json({ success: true, data: submission });
});
