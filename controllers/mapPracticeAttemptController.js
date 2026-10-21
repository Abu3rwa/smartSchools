import { asyncHandler } from '../middleware/errorHandler.js';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeSettings from '../models/MapPracticeSettings.js';
import Student from '../models/Student.js';
import { ensureStudentOwnsPracticeData, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { gradeMapPracticeAttempt, gradeMapPracticeQuestion } from '../services/mapPracticeGradingService.js';
import {
  applyMapPracticeReviewMarks,
  hideMapPracticeAttemptAnswerKeys,
  hideMapPracticeQuestionAnswers
} from '../services/mapPracticeReviewService.js';
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
  const responseAttempt = req.user.role === 'student'
    ? hideMapPracticeAttemptAnswerKeys(attempt.toObject ? attempt.toObject() : attempt)
    : attempt;
  const responseQuestions = req.user.role === 'student'
    ? questions.map(hideMapPracticeQuestionAnswers)
    : questions;
  res.json({ success: true, data: { attempt: responseAttempt, questions: responseQuestions } });
});

export const saveMapPracticeAnswer = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }
  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ success: false, message: 'Submitted practice answers can no longer be changed.' });
  }

  const { questionId, response, flagged = false } = req.body || {};
  if (!questionId) {
    return res.status(400).json({ success: false, message: 'questionId is required.' });
  }

  const question = await MapPracticeQuestion.findOne({
    _id: questionId,
    school: req.schoolId,
    set: attempt.set,
    active: true
  }).lean();
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found.' });
  }

  const currentAnswers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const index = currentAnswers.findIndex((answer) => String(answer.question) === String(question._id));
  const assignment = attempt.assignment
    ? await MapPracticeAssignment.findOne({ _id: attempt.assignment, school: req.schoolId }).lean()
    : null;
  const settings = await MapPracticeSettings.findOne({ school: req.schoolId }).lean();
  const feedbackMode = assignment?.feedbackMode || settings?.feedbackMode || 'instant';
  const instantFeedback = feedbackMode === 'instant';
  const grading = instantFeedback
    ? gradeMapPracticeQuestion({
      questionType: question.questionType,
      studentAnswer: response,
      correctAnswer: question.correctAnswer,
      options: question.options || [],
      partialCreditMultiSelect: Boolean(settings?.partialCreditMultiSelect)
    })
    : null;
  const answerRecord = {
    question: question._id,
    questionId: question.questionId,
    response,
    flagged,
    isCorrect: grading?.isCorrect ?? null,
    score: grading?.score ?? 0,
    autoGraded: Boolean(grading && !grading.requiresTeacherReview),
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

  const responseAttempt = req.user.role === 'student'
    ? hideMapPracticeAttemptAnswerKeys(record.toObject())
    : record;
  const feedback = req.user.role === 'student' && instantFeedback
    ? {
      isCorrect: grading.isCorrect,
      score: grading.score,
      requiresTeacherReview: grading.requiresTeacherReview,
      explanation: question.explanation || grading.explanation,
      correctAnswer: grading.requiresTeacherReview ? undefined : question.correctAnswer,
      options: grading.requiresTeacherReview ? undefined : question.options
    }
    : undefined;
  res.json({ success: true, data: { attempt: responseAttempt, feedback } });
});

export const submitMapPracticeAttempt = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }
  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ success: false, message: 'This practice set has already been submitted.' });
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
        answers: graded.map((answer) => Object.fromEntries(
          Object.entries(answer).filter(([key]) => !['questionType', 'correctAnswer', 'options'].includes(key))
        )),
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

  const responseAttempt = req.user.role === 'student'
    ? hideMapPracticeAttemptAnswerKeys(updated.toObject())
    : updated;
  res.json({ success: true, data: { attempt: responseAttempt, score, maxScore, needsTeacherReview } });
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
  if (!['submitted', 'reviewed'].includes(attempt.status)) {
    return res.status(400).json({ success: false, message: 'Only submitted practice can be reviewed.' });
  }
  if (!Array.isArray(req.body?.answers) || req.body.answers.some((item) =>
    !item || typeof item.answerId !== 'string' ||
    !(typeof item.isCorrect === 'boolean' || item.isCorrect === null) ||
    (item.teacherComment !== undefined && (typeof item.teacherComment !== 'string' || item.teacherComment.length > 2000)))) {
    return res.status(400).json({ success: false, message: 'Provide answer IDs with a correct, incorrect, or pending mark.' });
  }
  const answerIds = req.body.answers.map((item) => item.answerId);
  if (new Set(answerIds).size !== answerIds.length) {
    return res.status(400).json({ success: false, message: 'Each answer can only be marked once per review.' });
  }

  const review = applyMapPracticeReviewMarks(attempt.answers || [], req.body.answers);
  if (review.error) return res.status(400).json({ success: false, message: review.error });

  const note = String(req.body.teacherComment || '').trim();
  const next = await MapPracticeAttempt.findOneAndUpdate(
    { _id: attempt._id, school: req.schoolId },
    {
      $set: {
        answers: review.answers,
        score: review.score,
        maxScore: review.maxScore,
        reviewStatus: review.reviewStatus,
        teacherComment: note,
        status: review.status,
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
  if (attempt.status === 'in_progress') {
    return res.status(400).json({ success: false, message: 'This practice set has not been submitted yet.' });
  }

  const populated = await MapPracticeAttempt.findById(attempt._id)
    .populate('set')
    .populate('student', 'firstName lastName studentId')
    .lean();
  const questionIds = (populated.answers || []).map((answer) => answer.question).filter(Boolean);
  const questions = await MapPracticeQuestion.find({ _id: { $in: questionIds }, school: req.schoolId }).lean();
  const questionById = new Map(questions.map((question) => [String(question._id), question]));
  const answers = (populated.answers || []).map((answer) => {
    const question = questionById.get(String(answer.question));
    const questionDetails = question || answer.questionSnapshot || {};
    const safeDetails = req.user.role === 'student'
      ? hideMapPracticeQuestionAnswers(questionDetails)
      : questionDetails;
    const answerWithDetails = { ...answer, questionDetails: safeDetails };
    return req.user.role === 'student'
      ? hideMapPracticeAttemptAnswerKeys({ answers: [answerWithDetails] }).answers[0]
      : answerWithDetails;
  });
  res.json({ success: true, data: { attempt: { ...populated, answers } } });
});

export const getMapPracticeReviewOptions = asyncHandler(async (req, res) => {
  const items = await MapPracticeAttempt.find({ school: req.schoolId, status: 'submitted' })
    .populate('student', 'firstName lastName studentId')
    .populate('set', 'title')
    .lean();

  const available = [];
  for (const item of items) {
    if (req.user.role === 'student') {
      const owns = await ensureStudentOwnsPracticeData({ req, studentId: item.student?._id });
      if (!owns) continue;
    } else if (['admin', 'teacher'].includes(req.user.role)) {
      const allowed = await ensureTeacherCanAccessStudent({ req, studentId: item.student?._id });
      if (!allowed) continue;
    }
    available.push(req.user.role === 'student' ? hideMapPracticeAttemptAnswerKeys(item) : item);
  }

  res.json({ success: true, data: { items: available } });
});

export const normalizeShortTextAnswer = (value) => normalizeShortText(value);
export const normalizeAcceptedAnswers = (value) => normalizeAnswerList(value);
