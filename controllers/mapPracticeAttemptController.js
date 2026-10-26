import { asyncHandler } from '../middleware/errorHandler.js';
import mongoose from 'mongoose';
import MapPracticeAttempt from '../models/MapPracticeAttempt.js';
import MapPracticeAssignment from '../models/MapPracticeAssignment.js';
import MapPracticeQuestion from '../models/MapPracticeQuestion.js';
import MapPracticeSet from '../models/MapPracticeSet.js';
import MapPracticeSettings from '../models/MapPracticeSettings.js';
import Student from '../models/Student.js';
import { ensureStudentOwnsPracticeData, ensureTeacherCanAccessStudent } from '../services/mapPracticeAccessService.js';
import { gradeMapPracticeAttempt, gradeMapPracticeQuestion } from '../services/mapPracticeGradingService.js';
import {
  applyMapPracticeReviewMarks,
  buildMapPracticePassageSnapshot,
  buildMapPracticeStudentFields,
  hideMapPracticeAttemptAnswerKeys,
  hideMapPracticeQuestionAnswers
} from '../services/mapPracticeReviewService.js';
import { normalizeShortText, normalizeAnswerList } from '../validators/mapPracticeValidators.js';
import { describeObjectiveAnswer } from '../services/assessment/answerFormat.js';

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

export const resumeMapPracticeAttempt = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }
  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ success: false, message: 'This practice set has already been submitted.' });
  }

  const [questions, assignment, set] = await Promise.all([
    MapPracticeQuestion.find({ school: req.schoolId, set: attempt.set, active: true }).sort({ order: 1 }).lean(),
    attempt.assignment
      ? MapPracticeAssignment.findOne({ _id: attempt.assignment, school: req.schoolId })
        .select('plan set status dueDate feedbackMode')
        .populate('set', 'title questionCount estimatedMinutes order')
        .lean()
      : null,
    MapPracticeSet.findOne({ _id: attempt.set, school: req.schoolId })
      .select('title questionCount estimatedMinutes order')
      .lean()
  ]);
  if (questions.length === 0) {
    return res.status(404).json({ success: false, message: 'This practice set has no questions.' });
  }

  const isStudent = req.user.role === 'student';
  res.json({
    success: true,
    data: {
      attempt: isStudent ? hideMapPracticeAttemptAnswerKeys(attempt) : attempt,
      questions: isStudent ? questions.map(hideMapPracticeQuestionAnswers) : questions,
      // The page needs a title even when the assignment record was removed.
      assignment: assignment || (attempt.assignment ? { _id: attempt.assignment, set } : { set })
    }
  });
});

const buildAttemptAnswerFields = ({ question, response, flagged = false, grading = null }) => ({
  questionId: question.questionId,
  response,
  flagged: Boolean(flagged),
  isCorrect: grading?.isCorrect ?? null,
  score: grading?.score ?? 0,
  autoGraded: Boolean(grading && !grading.requiresTeacherReview),
  teacherOverride: false,
  teacherComment: '',
  questionSnapshot: {
    questionId: question.questionId,
    questionType: question.questionType,
    stem: question.stem,
    options: question.options,
    ...buildMapPracticeStudentFields(question)
  },
  passageSnapshot: buildMapPracticePassageSnapshot(question),
  correctAnswerSnapshot: question.correctAnswer,
  explanationSnapshot: question.explanation
});

// One answer per atomic update. Replacing the whole answers array made concurrent
// saves overwrite each other and rewrote every snapshot on every save.
const saveAttemptAnswer = async ({ attemptId, schoolId, question, fields }) => {
  const updated = await MapPracticeAttempt.updateOne(
    {
      _id: attemptId,
      school: schoolId,
      status: 'in_progress',
      'answers.question': question._id
    },
    {
      $set: {
        ...Object.fromEntries(
          Object.entries(fields).map(([key, value]) => [`answers.$[entry].${key}`, value])
        ),
        savedAt: new Date()
      }
    },
    { arrayFilters: [{ 'entry.question': question._id }] }
  );
  if (updated.matchedCount > 0) return;

  await MapPracticeAttempt.updateOne(
    // The $ne guard keeps two concurrent first-saves from pushing duplicate entries.
    {
      _id: attemptId,
      school: schoolId,
      status: 'in_progress',
      'answers.question': { $ne: question._id }
    },
    {
      $push: {
        answers: { _id: new mongoose.Types.ObjectId(), question: question._id, ...fields }
      },
      $set: { savedAt: new Date() }
    }
  );
};

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

  const [assignment, settings] = await Promise.all([
    attempt.assignment
      ? MapPracticeAssignment.findOne({ _id: attempt.assignment, school: req.schoolId }).lean()
      : null,
    MapPracticeSettings.findOne({ school: req.schoolId }).lean()
  ]);
  const feedbackMode = assignment?.feedbackMode || settings?.feedbackMode || 'instant';
  const instantFeedback = feedbackMode === 'instant';
  const grading = instantFeedback
    ? gradeMapPracticeQuestion({
      questionType: question.questionType,
      studentAnswer: response,
      correctAnswer: question.correctAnswer,
      options: question.options || [],
      matchingPairs: question.matchingPairs || [],
      orderingItems: question.orderingItems || [],
      blanks: question.blanks || [],
      numericRule: question.numericRule || null,
      partialCreditMultiSelect: Boolean(settings?.partialCreditMultiSelect)
    })
    : null;
  const answerFields = buildAttemptAnswerFields({ question, response, flagged, grading });
  await saveAttemptAnswer({
    attemptId: attempt._id,
    schoolId: req.schoolId,
    question,
    fields: answerFields
  });

  // The page only needs the saved response for its progress bars; snapshots stay on the server.
  const responseAnswer = {
    question: question._id,
    questionId: answerFields.questionId,
    response,
    isCorrect: answerFields.isCorrect
  };
  const objectiveType = ['ordering', 'fill_in_blank', 'numeric_response'].includes(question.questionType);
  const revealAnswer = grading?.requiresTeacherReview
    ? undefined
    : objectiveType
      ? describeObjectiveAnswer({ detail: grading.gradingDetail })
      : question.correctAnswer;
  const feedback = req.user.role === 'student' && instantFeedback
    ? {
      isCorrect: grading.isCorrect,
      score: grading.score,
      requiresTeacherReview: grading.requiresTeacherReview,
      explanation: question.explanation || grading.explanation,
      correctAnswer: revealAnswer,
      options: grading.requiresTeacherReview ? undefined : question.options,
      matchingPairs: grading.requiresTeacherReview ? undefined : question.matchingPairs,
      ...buildMapPracticeStudentFields(question)
    }
    : undefined;
  res.json({ success: true, data: { answer: responseAnswer, feedback } });
});

export const saveMapPracticeAnswers = asyncHandler(async (req, res) => {
  const attempt = await getAttemptAccess({ req, attemptId: req.params.attemptId });
  if (!attempt) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this attempt.' });
  }
  if (attempt.status !== 'in_progress') {
    return res.status(400).json({ success: false, message: 'Submitted practice answers can no longer be changed.' });
  }

  const items = Array.isArray(req.body?.answers) ? req.body.answers : null;
  if (!items) {
    return res.status(400).json({ success: false, message: 'Provide the answers to save.' });
  }
  if (items.length > 200) {
    return res.status(400).json({ success: false, message: 'Save fewer answers at once.' });
  }
  if (items.length === 0) {
    return res.json({ success: true, data: { saved: 0, skipped: 0 } });
  }

  const seen = new Set();
  const candidates = [];
  items.forEach((item) => {
    const questionId = String(item?.questionId || '');
    if (!mongoose.isValidObjectId(questionId) || seen.has(questionId)) return;
    seen.add(questionId);
    candidates.push({ questionId, response: item.response ?? null, flagged: Boolean(item.flagged) });
  });

  const questions = candidates.length
    ? await MapPracticeQuestion.find({
      _id: { $in: candidates.map((item) => item.questionId) },
      school: req.schoolId,
      set: attempt.set,
      active: true
    }).lean()
    : [];
  const questionById = new Map(questions.map((question) => [String(question._id), question]));
  const pending = candidates.filter((item) => questionById.has(item.questionId));

  await Promise.all(pending.map((item) => saveAttemptAnswer({
    attemptId: attempt._id,
    schoolId: req.schoolId,
    question: questionById.get(item.questionId),
    fields: buildAttemptAnswerFields({
      question: questionById.get(item.questionId),
      response: item.response,
      flagged: item.flagged
    })
  })));

  res.json({
    success: true,
    data: { saved: pending.length, skipped: candidates.length - pending.length }
  });
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
      matchingPairs: question.matchingPairs || [],
      orderingItems: question.orderingItems || [],
      blanks: question.blanks || [],
      numericRule: question.numericRule || null,
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
          Object.entries(answer).filter(([key]) => ![
            'questionType', 'correctAnswer', 'options', 'matchingPairs', 'orderingItems', 'blanks', 'numericRule'
          ].includes(key))
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
