import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import Student from '../models/Student.js';
import { ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';

export const reviewMapPracticeItem = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const attempt = await MapPracticeAttempt.findOne({ _id: req.params.attemptId, school: req.schoolId }).lean();
  if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });

  const authorized = await ensureTeacherCanAccessStudent({ req, studentId: attempt.student });
  if (!authorized) return res.status(403).json({ success: false, message: 'Not authorized for this student.' });

  const answerIndex = Number(req.body.answerIndex ?? -1);
  const answers = Array.isArray(attempt.answers) ? [...attempt.answers] : [];
  if (answerIndex >= 0 && answerIndex < answers.length) {
    answers[answerIndex] = {
      ...answers[answerIndex],
      isCorrect: req.body.isCorrect !== undefined ? Boolean(req.body.isCorrect) : answers[answerIndex].isCorrect,
      teacherOverride: true,
      teacherComment: String(req.body.teacherComment || answers[answerIndex].teacherComment || '')
    };
  }

  const updated = await MapPracticeAttempt.findByIdAndUpdate(
    attempt._id,
    {
      $set: {
        answers,
        reviewStatus: 'reviewed',
        teacherComment: String(req.body.teacherComment || ''),
        status: 'reviewed',
        updatedAt: new Date()
      }
    },
    { new: true }
  );

  res.json({ success: true, data: { attempt: updated } });
});

export const getMapPracticeStudentDetail = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const student = await Student.findOne({ _id: req.params.studentId, school: req.schoolId }).lean();
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const authorized = await ensureTeacherCanAccessStudent({ req, studentId: student._id });
  if (!authorized) return res.status(403).json({ success: false, message: 'Not authorized for this student.' });

  const questions = await MapPracticeQuestion.find({ school: req.schoolId, student: student._id }).sort({ order: 1 }).lean();
  const attempts = await MapPracticeAttempt.find({ school: req.schoolId, student: student._id }).sort({ updatedAt: -1 }).lean();

  res.json({ success: true, data: { student, questions, attempts } });
});
