import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import Student from '../models/Student.js';
import { ensureStudentOwnsPracticeData, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { gradeMapPracticeAttempt } from '../services/mapPracticeGradingService.js';
import { normalizeShortText, normalizeAnswerList } from '../validators/mapPracticeValidators.js';

const getAttemptAccess = async ({ req, attemptId, allowTeacher = true }) => {
  const attempt = await MapPracticeAttempt.findOne({ _id: attemptId, school: req.schoolId }).lean();
  if (!attempt) return null;

  if (req.user.role === 'student') {
    const owns = await ensureStudentOwnsPracticeData({ req, studentId: attempt.student });
    return owns ? attempt : null;
  }

  if (allowTeacher && ['admin', 'teacher'].includes(req.user.role)) {
    const permitted = await ensureTeacherCanAccessStudent({ req, studentId: attempt.student });
    return permitted ? attempt : null;
  }

  return null;
};

export const startMapPracticeAttempt = asyncHandler(async (req, res) => {
  const assignment = await MapPracticeAssignment.findOne({ _id: req.params.assignmentId, school: req.schoolId }).lean();
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });

  const student = await Student.findOne({ _id: assignment.student, school: req.schoolId }).select('_id user').lean();
  if (req.user.role === 'student' && String(student?.user) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'You can only start your own practice.' });
  }

  let attempt = await MapPracticeAttempt.findOne({ school: req.schoolId, set: assignment.set, student: assignment.student }).lean();
  if (!attempt) {
    attempt = await MapPracticeAttempt.create({
      school: req.schoolId,
      student: assignment.student,
      plan: assignment.plan,
      set: assignment.set,
      assignment: assignment._id,
      status: 'in_progress',
      reviewStatus: 'pending',
      answers: [],
      score: 0,
      maxScore: 0,
      startedAt: new Date(),
      savedAt: new Date()
    });
  }

  const questions = await MapPracticeQuestion.find({ school: req.schoolId, set: assignment.set, active: true }).sort({ order: 1 }).lean();
  res.json({ success: true, data: { attempt, questions } });
});

export const saveMapPracticeAnswer = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }

  const { questionId, response, flagged = false } = req.body || {};
  if (!questionId) {
    return res.status(400).json({ success: false, message: 'questionId is required.' });
  }

  const question = await MapPracticeQuestion.findOne({ _id: questionId, school: req.schoolId }).lean();
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found.' });
  }

  const currentAnswers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const index = currentAnswers.findIndex((answer) => String(answer.question) === String(question._id));
  const answerRecord = {
    question: question._id,
    questionId: question.questionId,
    response,
    flagged,
    isCorrect: null,
    autoGraded: false,
    teacherOverride: false,
    teacherComment: '',
    questionSnapshot: { questionId: question.questionId, stem: question.stem, options: question.options },
    correctAnswerSnapshot: question.correctAnswer,
    explanationSnapshot: question.explanation
  };

  if (index >= 0) {
    currentAnswers[index] = answerRecord;
  } else {
    currentAnswers.push(answerRecord);
  }

  const record = await MapPracticeAttempt.findByIdAndUpdate(
    attempt._id,
    { $set: { answers: currentAnswers, savedAt: new Date(), status: 'in_progress' } },
    { new: true }
  );

  res.json({ success: true, data: { attempt: record } });
});

export const submitMapPracticeAttempt = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }

  const questions = await MapPracticeQuestion.find({ school: req.schoolId, set: attempt.set, active: true }).sort({ order: 1 }).lean();
  const questionMap = new Map(questions.map((question) => [String(question._id), question]));

  const gradedAnswers = (attempt.answers || []).map((answer) => {
    const question = questionMap.get(String(answer.question));
    if (!question) {
      return {
        ...answer,
        isCorrect: null,
        score: 0,
        requiresTeacherReview: true,
        explanation: 'This question is no longer available for grading.'
      };
    }

    return {
      ...answer,
      questionType: question.questionType,
      correctAnswer: question.correctAnswer,
      options: question.options || [],
      score: answer.score ?? 0,
      explanation: answer.explanation || question.explanation || ''
    };
  });

  const { score, maxScore, graded } = gradeMapPracticeAttempt({ answers: gradedAnswers });
  const needsTeacherReview = graded.some((answer) => answer.requiresTeacherReview || answer.isCorrect === null);

  const updated = await MapPracticeAttempt.findByIdAndUpdate(
    attempt._id,
    {
      $set: {
        answers: graded.map(({ questionType, correctAnswer, options, ...answer }) => answer),
        score,
        maxScore,
        status: 'submitted',
        submittedAt: new Date(),
        reviewStatus: needsTeacherReview ? 'pending' : 'reviewed',
        savedAt: new Date()
      }
    },
    { new: true }
  );

  res.json({ success: true, data: { attempt: updated, score, maxScore, needsTeacherReview } });
});

export const getMapPracticeReviewQueue = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const attempts = await MapPracticeAttempt.find({ school: req.schoolId, reviewStatus: 'pending', status: 'submitted' })
    .populate({ path: 'student', select: 'firstName lastName studentId currentClass' })
    .populate({ path: 'set', select: 'title' })
    .sort({ submittedAt: -1 })
    .lean();

  const filtered = [];
  for (const attempt of attempts) {
    const student = attempt.student;
    if (!student) continue;
    const allowed = await ensureTeacherCanAccessStudent({ req, studentId: student._id });
    if (allowed) filtered.push(attempt);
  }

  res.json({ success: true, data: { items: filtered } });
});

export const reviewMapPracticeAttempt = asyncHandler(async (req, res) => {
  if (!['admin', 'teacher'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Teacher access required.' });
  }

  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId, allowTeacher: true });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized.' });
  }

  const answers = Array.isArray(attempt.answers) ? attempt.answers.map((answer, index) => {
    const overrideValue = req.body.answers?.[index];
    if (overrideValue === undefined) return answer;
    return {
      ...answer,
      isCorrect: overrideValue.isCorrect !== undefined ? Boolean(overrideValue.isCorrect) : answer.isCorrect,
      teacherOverride: true,
      teacherComment: overrideValue.teacherComment || answer.teacherComment || '',
      explanation: overrideValue.explanation || answer.explanation || ''
    };
  }) : [];

  const note = String(req.body.teacherComment || '').trim();
  const next = await MapPracticeAttempt.findOneAndUpdate(
    { _id: attempt._id, school: req.schoolId },
    {
      $set: {
        answers,
        reviewStatus: 'reviewed',
        teacherComment: note,
        status: 'reviewed',
        submittedAt: req.body.submittedAt || attempt.submittedAt || new Date(),
        updatedAt: new Date()
      }
    },
    { new: true }
  );

  res.json({ success: true, data: { attempt: next } });
});

export const getMapPracticeAttemptById = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }

  const populated = await MapPracticeAttempt.findById(attempt._id).populate('set').populate('student', 'firstName lastName studentId').lean();
  res.json({ success: true, data: { attempt: populated } });
});

export const getMapPracticeReviewOptions = asyncHandler(async (req, res) => {
  const items = await MapPracticeAttempt.find({ school: req.schoolId, status: 'submitted' })
    .populate('student', 'firstName lastName studentId')
    .populate('set', 'title')
    .lean();

  const available = [];
  for (const item of items) {
    if (req.user.role === 'student') {
      if (String(item.student?._id) !== String(req.user._id)) continue;
    }
    available.push(item);
  }

  res.json({ success: true, data: { items: available } });
});

export const normalizeShortTextAnswer = (value) => normalizeShortText(value);
export const normalizeAcceptedAnswers = (value) => normalizeAnswerList(value);
