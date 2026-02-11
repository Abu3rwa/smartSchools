import PracticeAttempt from '../models/PracticeAttempt.js';
import StandardAssignment from '../models/StandardAssignment.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import standardsPracticeAIService from '../services/standardsPracticeAIService.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { resolveTeacherProfile } from '../helpers/teacherScoping.js';

/**
 * @desc    Get student's assigned standards (for student practice dashboard)
 * @route   GET /api/practice/my-assignments
 * @access  Private (Student)
 */
export const getMyAssignments = asyncHandler(async (req, res) => {
    // Find the student record linked to this user
    const student = await Student.findOne({ user: req.user._id, status: 'active' })
        .populate('currentClass', 'name grade section academicYear');
    if (!student) {
        return res.status(404).json({
            success: false,
            message: 'Student profile not found'
        });
    }

    // Find assignments where student is specifically listed OR assigned to the whole class.
    // Note: for older records, `students` might be missing/null; treat that as "whole class".
    const classId = student.currentClass?._id || student.currentClass;
    const orConditions = [{ students: student._id }];
    if (classId) {
        orConditions.push({
            class: classId,
            $or: [
                { students: { $size: 0 } },
                { students: { $exists: false } },
                { students: null }
            ]
        });
    }

    const assignments = await StandardAssignment.find({
        isActive: true,
        $or: orConditions
    })
        .populate({
            path: 'standard',
            select: 'code name description gradeLevel category masteryThreshold masteryMinQuestions'
        })
        .populate('subject', 'name code')
        .populate('class', 'name grade section')
        .sort({ createdAt: -1 });

    // Calculate mastery for each assignment
    const assignmentsWithProgress = await Promise.all(
        assignments.map(async (a) => {
            const mastery = await PracticeAttempt.calculateMastery(
                student._id,
                a.standard._id,
                a.standard.masteryThreshold,
                a.standard.masteryMinQuestions
            );
            return {
                ...a.toObject(),
                mastery
            };
        })
    );

    res.json({
        success: true,
        data: {
            studentId: student._id,
            studentClass: student.currentClass,
            assignments: assignmentsWithProgress
        }
    });
});

/**
 * @desc    Generate a new practice question for a standard
 * @route   POST /api/practice/generate
 * @access  Private (Student)
 */
export const generateQuestion = asyncHandler(async (req, res) => {
    const { assignmentId, difficulty, questionType } = req.body;

    // Find student
    const student = await Student.findOne({ user: req.user._id, status: 'active' });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    // Find assignment
    const assignment = await StandardAssignment.findById(assignmentId)
        .populate('standard')
        .populate('subject', 'name code');

    if (!assignment || !assignment.isActive) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify student is part of this assignment
    const isAssigned = assignment.students.length === 0
        ? student.currentClass?.toString() === assignment.class.toString()
        : assignment.students.some(s => s.toString() === student._id.toString());

    if (!isAssigned) {
        return res.status(403).json({ success: false, message: 'You are not assigned to this standard' });
    }

    // Check if already mastered
    const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        assignment.standard._id,
        assignment.standard.masteryThreshold,
        assignment.standard.masteryMinQuestions
    );

    if (mastery.isMastered) {
        return res.json({
            success: true,
            data: {
                mastered: true,
                mastery,
                message: 'You have already mastered this standard!'
            }
        });
    }

    // Get previous questions to avoid repeats
    const previousAttempts = await PracticeAttempt.find({
        student: student._id,
        standard: assignment.standard._id
    }).select('questionText').sort({ createdAt: -1 }).limit(10);

    const previousQuestions = previousAttempts.map(a => a.questionText);

    // Count attempt number
    const attemptCount = await PracticeAttempt.countDocuments({
        student: student._id,
        standard: assignment.standard._id
    });

    // Auto-adjust difficulty based on performance
    let effectiveDifficulty = difficulty || 'medium';
    if (!difficulty && mastery.totalAttempts >= 3) {
        if (mastery.percentage >= 80) effectiveDifficulty = 'hard';
        else if (mastery.percentage <= 40) effectiveDifficulty = 'easy';
    }

    // Generate question
    const question = await standardsPracticeAIService.generateQuestion({
        standard: assignment.standard,
        subjectName: assignment.subject.name,
        difficulty: effectiveDifficulty,
        questionType: questionType || 'multiple_choice',
        previousQuestions
    });

    // Save the attempt (pending answer)
    const attempt = await PracticeAttempt.create({
        school: req.schoolId,
        student: student._id,
        standard: assignment.standard._id,
        assignment: assignment._id,
        questionText: question.questionText,
        questionType: question.questionType,
        options: question.options,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        difficulty: question.difficulty,
        attemptNumber: attemptCount + 1,
        status: 'pending'
    });

    // Don't send correctAnswer to the student
    res.json({
        success: true,
        data: {
            attemptId: attempt._id,
            questionText: attempt.questionText,
            questionType: attempt.questionType,
            options: attempt.options,
            difficulty: attempt.difficulty,
            attemptNumber: attempt.attemptNumber,
            mastery
        }
    });
});

/**
 * @desc    Submit answer for a practice question
 * @route   POST /api/practice/submit
 * @access  Private (Student)
 */
export const submitAnswer = asyncHandler(async (req, res) => {
    const { attemptId, answer, timeSpentSeconds } = req.body;

    if (!attemptId || answer === undefined || answer === null) {
        return res.status(400).json({ success: false, message: 'attemptId and answer are required' });
    }

    // Find the attempt
    const attempt = await PracticeAttempt.findById(attemptId).populate('standard');
    if (!attempt) {
        return res.status(404).json({ success: false, message: 'Practice attempt not found' });
    }

    if (attempt.status !== 'pending') {
        return res.status(400).json({ success: false, message: 'This question has already been answered' });
    }

    // Verify ownership
    const student = await Student.findOne({ user: req.user._id });
    if (!student || attempt.student.toString() !== student._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Evaluate the answer
    const evaluation = await standardsPracticeAIService.evaluateAnswer({
        questionText: attempt.questionText,
        correctAnswer: attempt.correctAnswer,
        studentAnswer: answer,
        questionType: attempt.questionType,
        standard: attempt.standard
    });

    // Update the attempt
    attempt.studentAnswer = answer;
    attempt.isCorrect = evaluation.isCorrect;
    attempt.feedback = evaluation.feedback;
    attempt.answeredAt = new Date();
    attempt.timeSpentSeconds = timeSpentSeconds || 0;
    attempt.status = 'answered';
    await attempt.save();

    // Recalculate mastery
    const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        attempt.standard._id,
        attempt.standard.masteryThreshold,
        attempt.standard.masteryMinQuestions
    );

    res.json({
        success: true,
        data: {
            isCorrect: evaluation.isCorrect,
            correctAnswer: attempt.correctAnswer,
            explanation: attempt.explanation,
            feedback: evaluation.feedback,
            mastery,
            newlyMastered: mastery.isMastered
        }
    });
});

/**
 * @desc    Get student's practice history for a standard
 * @route   GET /api/practice/history/:standardId
 * @access  Private (Student)
 */
export const getPracticeHistory = asyncHandler(async (req, res) => {
    const student = await Student.findOne({ user: req.user._id });
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { page = 1, limit = 20 } = req.query;

    const query = {
        student: student._id,
        standard: req.params.standardId,
        status: 'answered'
    };

    const attempts = await PracticeAttempt.find(query)
        .select('questionText questionType studentAnswer correctAnswer isCorrect explanation feedback difficulty attemptNumber answeredAt timeSpentSeconds')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await PracticeAttempt.countDocuments(query);

    const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        req.params.standardId
    );

    res.json({
        success: true,
        data: {
            attempts,
            mastery,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        }
    });
});

/**
 * @desc    Get progress overview for a student (teacher/admin view)
 * @route   GET /api/practice/student/:studentId/progress
 * @access  Private (Admin, Teacher)
 */
export const getStudentProgress = asyncHandler(async (req, res) => {
    const { studentId } = req.params;

    const student = await Student.findById(studentId).select('firstName lastName studentId currentClass');
    if (!student) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    // Get all assignments for this student
    const assignments = await StandardAssignment.find({
        isActive: true,
        $or: [
            { students: studentId },
            { class: student.currentClass, students: { $size: 0 } }
        ]
    }).populate('standard', 'code name description masteryThreshold masteryMinQuestions')
      .populate('subject', 'name code');

    const progressData = await Promise.all(
        assignments.map(async (a) => {
            const mastery = await PracticeAttempt.calculateMastery(
                studentId,
                a.standard._id,
                a.standard.masteryThreshold,
                a.standard.masteryMinQuestions
            );

            // Get total attempts count
            const totalAllAttempts = await PracticeAttempt.countDocuments({
                student: studentId,
                standard: a.standard._id,
                status: 'answered'
            });

            return {
                assignment: {
                    _id: a._id,
                    standard: a.standard,
                    subject: a.subject,
                    assignedDate: a.assignedDate,
                    dueDate: a.dueDate
                },
                mastery,
                totalAllAttempts
            };
        })
    );

    res.json({
        success: true,
        data: {
            student,
            progress: progressData,
            summary: {
                totalAssigned: progressData.length,
                mastered: progressData.filter(p => p.mastery.isMastered).length,
                inProgress: progressData.filter(p => !p.mastery.isMastered && p.mastery.totalAttempts > 0).length,
                notStarted: progressData.filter(p => p.mastery.totalAttempts === 0).length
            }
        }
    });
});

/**
 * @desc    Get class-wide progress on an assignment (teacher view)
 * @route   GET /api/practice/assignment/:assignmentId/progress
 * @access  Private (Admin, Teacher)
 */
export const getAssignmentProgress = asyncHandler(async (req, res) => {
    const assignment = await StandardAssignment.findById(req.params.assignmentId)
        .populate('standard')
        .populate('class', 'name grade section')
        .populate('subject', 'name code');

    if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Get students
    let students;
    if (assignment.students.length > 0) {
        students = await Student.find({ _id: { $in: assignment.students }, status: 'active' })
            .select('firstName lastName studentId');
    } else {
        students = await Student.find({ currentClass: assignment.class._id, status: 'active' })
            .select('firstName lastName studentId');
    }

    const studentsProgress = await Promise.all(
        students.map(async (student) => {
            const mastery = await PracticeAttempt.calculateMastery(
                student._id,
                assignment.standard._id,
                assignment.standard.masteryThreshold,
                assignment.standard.masteryMinQuestions
            );
            const totalAttempts = await PracticeAttempt.countDocuments({
                student: student._id,
                standard: assignment.standard._id,
                status: 'answered'
            });
            return {
                student: student.toObject(),
                mastery,
                totalAttempts
            };
        })
    );

    const masteredCount = studentsProgress.filter(s => s.mastery.isMastered).length;

    res.json({
        success: true,
        data: {
            assignment,
            studentsProgress,
            summary: {
                totalStudents: studentsProgress.length,
                mastered: masteredCount,
                inProgress: studentsProgress.filter(s => !s.mastery.isMastered && s.mastery.totalAttempts > 0).length,
                notStarted: studentsProgress.filter(s => s.mastery.totalAttempts === 0).length,
                masteryRate: studentsProgress.length > 0
                    ? Math.round((masteredCount / studentsProgress.length) * 100)
                    : 0
            }
        }
    });
});
