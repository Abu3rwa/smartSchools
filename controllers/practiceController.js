import PracticeAttempt from "../models/PracticeAttempt.js";
import StandardAssignment from "../models/StandardAssignment.js";
import Student from "../models/Student.js";
import PracticeSession from "../models/PracticeSession.js";
import PracticeIntegrityEvent from "../models/PracticeIntegrityEvent.js";
import MasteryRecord from "../models/MasteryRecord.js";
import standardsPracticeAIService from "../services/standardsPracticeAIService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import {
  QUESTION_TYPES,
  DIFFICULTIES,
  generateQuestionResponseSchema,
  submitAnswerResponseSchema,
  integrityEventSchema,
} from "../schemas/practiceSchemas.js";

const DEFAULT_PRACTICE_CONFIG = {
  sessionType: "practice",
  questionLimit: null,
  timeLimitSeconds: null,
  allowedQuestionTypes: QUESTION_TYPES,
  allowedDifficulties: DIFFICULTIES,
  availability: { startAt: null, endAt: null },
  lockStudentOptions: false,
};

const DIFFICULTY_RANK = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const getAssignmentPracticeConfig = (assignment) => {
  const cfg = assignment?.practiceConfig || {};
  return {
    sessionType: cfg.sessionType || DEFAULT_PRACTICE_CONFIG.sessionType,
    questionLimit: cfg.questionLimit ?? DEFAULT_PRACTICE_CONFIG.questionLimit,
    timeLimitSeconds:
      cfg.timeLimitSeconds ?? DEFAULT_PRACTICE_CONFIG.timeLimitSeconds,
    allowedQuestionTypes:
      cfg.allowedQuestionTypes && cfg.allowedQuestionTypes.length > 0
        ? cfg.allowedQuestionTypes
        : DEFAULT_PRACTICE_CONFIG.allowedQuestionTypes,
    allowedDifficulties:
      cfg.allowedDifficulties && cfg.allowedDifficulties.length > 0
        ? cfg.allowedDifficulties
        : DEFAULT_PRACTICE_CONFIG.allowedDifficulties,
    availability: {
      startAt: cfg.availability?.startAt || null,
      endAt: cfg.availability?.endAt || null,
    },
    lockStudentOptions:
      cfg.lockStudentOptions ?? DEFAULT_PRACTICE_CONFIG.lockStudentOptions,
  };
};

const isWithinAvailability = (availability) => {
  if (!availability) return true;
  const now = new Date();
  if (availability.startAt && now < new Date(availability.startAt))
    return false;
  if (availability.endAt && now > new Date(availability.endAt)) return false;
  return true;
};

const calculateTimeRemaining = (session) => {
  if (!session?.timeLimitSeconds) return null;
  const elapsedSeconds = Math.floor(
    (Date.now() - new Date(session.startedAt).getTime()) / 1000,
  );
  return Math.max(session.timeLimitSeconds - elapsedSeconds, 0);
};

const buildSessionInfo = (session) => {
  if (!session) return null;
  const timeRemainingSeconds = calculateTimeRemaining(session);
  return {
    id: session._id.toString(),
    sessionType: session.sessionType,
    questionLimit: session.questionLimit ?? null,
    timeLimitSeconds: session.timeLimitSeconds ?? null,
    timeRemainingSeconds,
    status: session.status,
    questionsAnswered: session.questionsAnswered || 0,
    correctCount: session.correctCount || 0,
  };
};

const resolveDisplayAnswer = (correctAnswer, questionOptions = []) => {
  const normalized = (correctAnswer || "").trim().toUpperCase();
  const option =
    Array.isArray(questionOptions) &&
    questionOptions.find(
      (item) => (item?.label || "").trim().toUpperCase() === normalized,
    );

  if (option?.text) {
    return `${option.label}. ${option.text}`;
  }
  return correctAnswer;
};

const computeRecentPerformance = (attempts = []) => {
  let correctStreak = 0;
  let incorrectStreak = 0;

  for (const attempt of attempts) {
    if (attempt.isCorrect) correctStreak += 1;
    else break;
  }

  for (const attempt of attempts) {
    if (!attempt.isCorrect) incorrectStreak += 1;
    else break;
  }

  return {
    correctStreak,
    incorrectStreak,
    lastWasCorrect: attempts.length > 0 ? attempts[0].isCorrect : null,
  };
};

const resolveHighestDifficulty = (current, incoming) => {
  if (!incoming || !DIFFICULTY_RANK[incoming]) return current || null;
  if (!current || !DIFFICULTY_RANK[current]) return incoming;
  return DIFFICULTY_RANK[incoming] > DIFFICULTY_RANK[current]
    ? incoming
    : current;
};

const upsertMasteryRecord = async (
  schoolId,
  studentId,
  standardId,
  mastery,
  recentDifficulty,
) => {
  const query = {
    school: schoolId,
    student: studentId,
    standard: standardId,
  };
  const now = new Date();

  const existing = await MasteryRecord.findOne(query)
    .select("masteredAt highestDifficultyPassed")
    .lean();

  const isMastered = Boolean(mastery?.isMastered);
  const needsReview = Boolean(mastery?.needsReview);
  const lifetimeStats = mastery?.lifetimeStats || {};
  const rollingStats = mastery?.rollingWindowStats || {};
  const masteredAt = isMastered
    ? mastery?.masteredAt || existing?.masteredAt || now
    : existing?.masteredAt || null;
  const highestDifficultyPassed = resolveHighestDifficulty(
    existing?.highestDifficultyPassed,
    isMastered ? recentDifficulty : null,
  );

  await MasteryRecord.findOneAndUpdate(
    query,
    {
      $set: {
        isMastered,
        masteredAt,
        totalAttemptsAllTime:
          lifetimeStats.totalAttempts ?? mastery?.totalAttempts ?? 0,
        totalCorrectAllTime:
          lifetimeStats.correctCount ?? mastery?.correctCount ?? 0,
        currentStreak: rollingStats.currentStreak ?? 0,
        bestStreak: rollingStats.bestStreak ?? mastery?.bestStreak ?? 0,
        highestDifficultyPassed,
        lastPracticedAt: now,
        needsReview,
        reviewSuggestedAt: needsReview ? now : null,
      },
      $setOnInsert: {
        school: schoolId,
        student: studentId,
        standard: standardId,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );
};

/** Accuracy threshold to progress to next difficulty; below this on current level = remediate */
const ACCURACY_TO_PROGRESS = 80;
const ACCURACY_REMEDIATE_BELOW = 50;
const ACCURACY_WINDOW = 15;

/**
 * Adaptive difficulty: >80% on current level → move up; <50% → move down (remediation).
 * Falls back to recent 3 correct/incorrect for small samples.
 */
const getNextDifficulty = (current, allowed, recentAttempts) => {
  const order = DIFFICULTIES.filter((d) => allowed.includes(d));
  if (order.length === 0) return current || "medium";

  const recent = recentAttempts.slice(0, ACCURACY_WINDOW);
  const byDifficulty = { easy: { total: 0, correct: 0 }, medium: { total: 0, correct: 0 }, hard: { total: 0, correct: 0 } };
  recent.forEach((a) => {
    if (byDifficulty[a.difficulty]) {
      byDifficulty[a.difficulty].total += 1;
      if (a.isCorrect) byDifficulty[a.difficulty].correct += 1;
    }
  });

  let index = order.indexOf(current);
  if (index === -1) index = Math.floor(order.length / 2);
  const level = order[index];
  const stats = byDifficulty[level];
  const accuracy = stats.total >= 3 ? (stats.correct / stats.total) * 100 : null;

  if (stats.total >= 3 && accuracy !== null) {
    if (accuracy >= ACCURACY_TO_PROGRESS && index < order.length - 1) {
      return order[index + 1];
    }
    if (accuracy < ACCURACY_REMEDIATE_BELOW && index > 0) {
      return order[index - 1];
    }
  }

  const fallbackRecent = recentAttempts.slice(0, 3);
  const correctCount = fallbackRecent.filter((a) => a.isCorrect).length;
  const incorrectCount = fallbackRecent.length - correctCount;
  if (correctCount >= 2 && index < order.length - 1) return order[index + 1];
  if (incorrectCount >= 2 && index > 0) return order[index - 1];
  return order[index];
};

const pickQuestionType = (allowed, recentAttempts) => {
  if (allowed.length === 1) return allowed[0];
  const stats = allowed.reduce((acc, type) => {
    acc[type] = { total: 0, correct: 0 };
    return acc;
  }, {});

  recentAttempts.forEach((attempt) => {
    if (stats[attempt.questionType]) {
      stats[attempt.questionType].total += 1;
      if (attempt.isCorrect) stats[attempt.questionType].correct += 1;
    }
  });

  let chosen = allowed[0];
  let lowestAccuracy = 101;
  allowed.forEach((type) => {
    const total = stats[type].total;
    const accuracy = total > 0 ? (stats[type].correct / total) * 100 : 0;
    if (accuracy < lowestAccuracy) {
      lowestAccuracy = accuracy;
      chosen = type;
    }
  });

  return chosen;
};

const resolveQuestionSettings = ({
  requestedDifficulty,
  requestedQuestionType,
  config,
  recentAttempts,
}) => {
  const allowedTypes = config.allowedQuestionTypes;
  const allowedDifficulties = config.allowedDifficulties;

  let questionType = allowedTypes[0];
  if (
    !config.lockStudentOptions &&
    requestedQuestionType &&
    allowedTypes.includes(requestedQuestionType)
  ) {
    questionType = requestedQuestionType;
  } else {
    questionType = pickQuestionType(allowedTypes, recentAttempts);
  }

  let baseDifficulty = "medium";
  if (
    !config.lockStudentOptions &&
    requestedDifficulty &&
    allowedDifficulties.includes(requestedDifficulty)
  ) {
    baseDifficulty = requestedDifficulty;
  } else if (allowedDifficulties.includes("medium")) {
    baseDifficulty = "medium";
  } else {
    baseDifficulty = allowedDifficulties[0] || "medium";
  }

  const difficulty = getNextDifficulty(
    baseDifficulty,
    allowedDifficulties,
    recentAttempts,
  );
  const order = DIFFICULTIES.filter((d) => allowedDifficulties.includes(d));
  const wasRemediated =
    order.indexOf(difficulty) < order.indexOf(baseDifficulty);
  return { questionType, difficulty, suggestRemediation: wasRemediated };
};

const resolveActiveSession = async ({
  studentId,
  assignment,
  config,
  schoolId,
}) => {
  const existing = await PracticeSession.findOne({
    student: studentId,
    assignment: assignment._id,
    status: "active",
  }).sort({ createdAt: -1 });

  const now = new Date();
  if (existing) {
    const timeRemaining = calculateTimeRemaining(existing);
    if (existing.timeLimitSeconds && timeRemaining === 0) {
      existing.status = "expired";
      existing.endedAt = now;
      await existing.save();
      return null;
    }

    if (
      existing.questionLimit &&
      existing.questionsAnswered >= existing.questionLimit
    ) {
      existing.status = "completed";
      existing.endedAt = now;
      await existing.save();
      return null;
    }

    return existing;
  }

  return PracticeSession.create({
    school: schoolId,
    student: studentId,
    assignment: assignment._id,
    standard: assignment.standard._id || assignment.standard,
    sessionType: config.sessionType,
    questionLimit: config.questionLimit,
    timeLimitSeconds: config.timeLimitSeconds,
    allowedQuestionTypes: config.allowedQuestionTypes,
    allowedDifficulties: config.allowedDifficulties,
    startedAt: now,
    lastActivityAt: now,
  });
};

/**
 * @desc    Get student's assigned standards (for student practice dashboard)
 * @route   GET /api/practice/my-assignments
 * @access  Private (Student)
 */
export const getMyAssignments = asyncHandler(async (req, res) => {
  // Find the student record linked to this user
  const student = await Student.findOne({
    user: req.user._id,
    status: "active",
  }).populate("currentClass", "name grade section academicYear");
  if (!student) {
    return res.status(404).json({
      success: false,
      message: "Student profile not found",
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
        { students: null },
      ],
    });
  }

  const assignments = await StandardAssignment.find({
    isActive: true,
    $or: orConditions,
  })
    .populate({
      path: "standard",
      select:
        "code name description gradeLevel category masteryThreshold masteryMinQuestions",
    })
    .populate("subject", "name code")
    .populate("class", "name grade section")
    .sort({ createdAt: -1 });

  // Calculate mastery for each assignment
  const assignmentsWithProgress = await Promise.all(
    assignments.map(async (a) => {
      const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        a.standard._id,
        a.standard.masteryThreshold,
        a.standard.masteryMinQuestions,
        3,
        req.schoolId,
      );
      return {
        ...a.toObject(),
        mastery,
      };
    }),
  );

  res.json({
    success: true,
    data: {
      studentId: student._id,
      studentClass: student.currentClass,
      assignments: assignmentsWithProgress,
    },
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
  const student = await Student.findOne({
    user: req.user._id,
    status: "active",
  });
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student profile not found" });
  }

  // Find assignment
  const assignment = await StandardAssignment.findById(assignmentId)
    .populate("standard")
    .populate("subject", "name code");

  if (!assignment || !assignment.isActive) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }

  // Verify student is part of this assignment
  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  const isAssigned =
    assignmentStudents.length === 0
      ? student.currentClass?.toString() === assignment.class.toString()
      : assignmentStudents.some(
          (s) => s.toString() === student._id.toString(),
        );

  if (!isAssigned) {
    return res
      .status(403)
      .json({
        success: false,
        message: "You are not assigned to this standard",
      });
  }

  const practiceConfig = getAssignmentPracticeConfig(assignment);
  if (!isWithinAvailability(practiceConfig.availability)) {
    return res.status(403).json({
      success: false,
      message: "This practice window is currently closed",
    });
  }

  // Check if already mastered (use persisted + rolling logic)
  const mastery = await PracticeAttempt.calculateMastery(
    student._id,
    assignment.standard._id,
    assignment.standard.masteryThreshold,
    assignment.standard.masteryMinQuestions,
    3,
    req.schoolId,
  );

  if (mastery.isMastered) {
    const payload = generateQuestionResponseSchema.parse({
      status: "mastered",
      mastery,
      message: "You have already mastered this standard!",
      studentFirstName: student.firstName || null,
      question: null,
      session: null,
    });
    return res.json({ success: true, data: payload });
  }

  const session = await resolveActiveSession({
    studentId: student._id,
    assignment,
    config: practiceConfig,
    schoolId: req.schoolId,
  });

  if (!session) {
    const payload = generateQuestionResponseSchema.parse({
      status: "session_complete",
      message: "This practice session is complete. Please start again later.",
      studentFirstName: student.firstName || null,
      question: null,
      session: null,
    });
    return res.json({ success: true, data: payload });
  }

  const timeRemainingSeconds = calculateTimeRemaining(session);
  if (session.timeLimitSeconds && timeRemainingSeconds === 0) {
    session.status = "expired";
    session.endedAt = new Date();
    await session.save();
    const payload = generateQuestionResponseSchema.parse({
      status: "session_complete",
      message: "This practice session has expired.",
      studentFirstName: student.firstName || null,
      question: null,
      session: buildSessionInfo(session),
    });
    return res.json({ success: true, data: payload });
  }

  if (
    session.questionLimit &&
    session.questionsAnswered >= session.questionLimit
  ) {
    session.status = "completed";
    session.endedAt = new Date();
    await session.save();
    const payload = generateQuestionResponseSchema.parse({
      status: "session_complete",
      message: "You reached the question limit for this session.",
      studentFirstName: student.firstName || null,
      question: null,
      session: buildSessionInfo(session),
    });
    return res.json({ success: true, data: payload });
  }

  // Get previous questions to avoid repeats
  const previousAttempts = await PracticeAttempt.find({
    student: student._id,
    standard: assignment.standard._id,
  })
    .select("questionText")
    .sort({ createdAt: -1 })
    .limit(10);

  const previousQuestions = previousAttempts.map((a) => a.questionText);

  // Count attempt number
  const attemptCount = await PracticeAttempt.countDocuments({
    student: student._id,
    standard: assignment.standard._id,
  });

  const recentAttempts = await PracticeAttempt.find({
    student: student._id,
    assignment: assignment._id,
    status: "answered",
  })
    .select("questionType difficulty isCorrect")
    .sort({ createdAt: -1 })
    .limit(ACCURACY_WINDOW);

  const {
    questionType: effectiveQuestionType,
    difficulty: effectiveDifficulty,
    suggestRemediation,
  } = resolveQuestionSettings({
    requestedDifficulty: difficulty,
    requestedQuestionType: questionType,
    config: practiceConfig,
    recentAttempts,
  });

  const subjectName = assignment.subject?.name || "General Studies";

  // Generate question
  const question = await standardsPracticeAIService.generateQuestion({
    standard: assignment.standard,
    subjectName,
    difficulty: effectiveDifficulty,
    questionType: effectiveQuestionType,
    previousQuestions,
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
    status: "pending",
    session: session._id,
    sessionType: session.sessionType,
  });

  // Don't send correctAnswer to the student
  const payload = generateQuestionResponseSchema.parse({
    status: "question",
    mastery,
    message: null,
    studentFirstName: student.firstName || null,
    suggestRemediation: suggestRemediation ?? false,
    question: {
      attemptId: attempt._id.toString(),
      questionText: attempt.questionText,
      questionType: attempt.questionType,
      options: attempt.options,
      difficulty: attempt.difficulty,
      attemptNumber: attempt.attemptNumber,
    },
    session: buildSessionInfo(session),
  });

  res.json({ success: true, data: payload });
});

/**
 * @desc    Submit answer for a practice question
 * @route   POST /api/practice/submit
 * @access  Private (Student)
 */
export const submitAnswer = asyncHandler(async (req, res) => {
  const { attemptId, answer, timeSpentSeconds, hintsUsed } = req.body;

  if (!attemptId || answer === undefined || answer === null) {
    return res
      .status(400)
      .json({ success: false, message: "attemptId and answer are required" });
  }

  // Find the attempt
  const attempt = await PracticeAttempt.findById(attemptId)
    .populate(
      "standard",
      "code name description gradeLevel masteryThreshold masteryMinQuestions",
    )
    .populate({
      path: "assignment",
      select: "subject",
      populate: {
        path: "subject",
        select: "name code",
      },
    });
  if (!attempt) {
    return res
      .status(404)
      .json({ success: false, message: "Practice attempt not found" });
  }

  if (attempt.status !== "pending") {
    return res
      .status(400)
      .json({
        success: false,
        message: "This question has already been answered",
      });
  }

  // Verify ownership
  const student = await Student.findOne({ user: req.user._id });
  if (!student || attempt.student.toString() !== student._id.toString()) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const recentAnsweredAttempts = await PracticeAttempt.find({
    school: req.schoolId,
    student: student._id,
    standard: attempt.standard._id,
    status: "answered",
  })
    .select("isCorrect")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  const recentPerformance = computeRecentPerformance(recentAnsweredAttempts);

  // Evaluate the answer
  const evaluation = await standardsPracticeAIService.evaluateAnswer({
    questionText: attempt.questionText,
    correctAnswer: attempt.correctAnswer,
    studentAnswer: answer,
    questionType: attempt.questionType,
    standard: attempt.standard,
    questionOptions: attempt.options || [],
    studentFirstName: student.firstName || "",
    subjectName: attempt.assignment?.subject?.name || "",
    gradeLevel: attempt.standard?.gradeLevel || null,
    difficulty: attempt.difficulty || "medium",
    attemptNumber: attempt.attemptNumber || 1,
    recentPerformance,
  });

  // Update the attempt
  attempt.studentAnswer = answer;
  attempt.isCorrect = evaluation.isCorrect;
  attempt.feedback = evaluation.feedback;
  attempt.feedbackParts = evaluation.feedbackParts || undefined;
  attempt.answeredAt = new Date();
  attempt.timeSpentSeconds = timeSpentSeconds || 0;
  attempt.hintsUsed = hintsUsed != null ? Math.max(0, Number(hintsUsed)) : 0;
  attempt.status = "answered";
  await attempt.save();

  // Recalculate mastery and persist (sticky mastery, lifetime stats)
  const mastery = await PracticeAttempt.calculateMastery(
    student._id,
    attempt.standard._id,
    attempt.standard.masteryThreshold,
    attempt.standard.masteryMinQuestions,
    3,
    req.schoolId,
  );
  const recordBefore = await MasteryRecord.findOne({
    school: req.schoolId,
    student: student._id,
    standard: attempt.standard._id,
  })
    .select("isMastered")
    .lean();
  await upsertMasteryRecord(
    req.schoolId,
    student._id,
    attempt.standard._id,
    mastery,
    attempt.difficulty,
  );
  const newlyMastered = mastery.isMastered && !recordBefore?.isMastered;

  let session = null;
  if (attempt.session) {
    session = await PracticeSession.findById(attempt.session);
    if (session && session.status === "active") {
      session.questionsAnswered = (session.questionsAnswered || 0) + 1;
      if (evaluation.isCorrect)
        session.correctCount = (session.correctCount || 0) + 1;
      session.lastActivityAt = new Date();

      const timeRemaining = calculateTimeRemaining(session);
      if (session.timeLimitSeconds && timeRemaining === 0) {
        session.status = "expired";
        session.endedAt = new Date();
      }

      if (
        session.questionLimit &&
        session.questionsAnswered >= session.questionLimit
      ) {
        session.status = "completed";
        session.endedAt = new Date();
      }

      await session.save();
    }
  }

  const correctAnswerDisplay = resolveDisplayAnswer(
    attempt.correctAnswer,
    attempt.options || [],
  );
  const payload = submitAnswerResponseSchema.parse({
    isCorrect: evaluation.isCorrect,
    correctAnswer: attempt.correctAnswer,
    correctAnswerDisplay,
    explanation: attempt.explanation || null,
    feedback: evaluation.feedback || null,
    feedbackParts: evaluation.feedbackParts || null,
    studentFirstName: student.firstName || null,
    mastery,
    newlyMastered,
    sessionComplete: session ? session.status !== "active" : false,
    session: buildSessionInfo(session),
  });

  res.json({ success: true, data: payload });
});

/**
 * @desc    Get student's practice history for a standard
 * @route   GET /api/practice/history/:standardId
 * @access  Private (Student)
 */
export const getPracticeHistory = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student profile not found" });
  }

  const { page = 1, limit = 20 } = req.query;

  const query = {
    student: student._id,
    standard: req.params.standardId,
    status: "answered",
  };

  const attemptsRaw = await PracticeAttempt.find(query)
    .select(
      "questionText questionType studentAnswer correctAnswer options isCorrect explanation feedback feedbackParts difficulty attemptNumber answeredAt timeSpentSeconds",
    )
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  const attempts = attemptsRaw.map((attempt) => {
    const attemptObj = attempt.toObject();
    return {
      ...attemptObj,
      correctAnswerDisplay:
        attemptObj.feedbackParts?.displayAnswer ||
        resolveDisplayAnswer(attemptObj.correctAnswer, attemptObj.options),
    };
  });

  const total = await PracticeAttempt.countDocuments(query);

  const mastery = await PracticeAttempt.calculateMastery(
    student._id,
    req.params.standardId,
    80,
    5,
    3,
    req.schoolId,
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
        pages: Math.ceil(total / limit),
      },
    },
  });
});

/**
 * @desc    Get progress overview for a student (teacher/admin view)
 * @route   GET /api/practice/student/:studentId/progress
 * @access  Private (Admin, Teacher)
 */
export const getStudentProgress = asyncHandler(async (req, res) => {
  const { studentId } = req.params;

  const student = await Student.findById(studentId).select(
    "firstName lastName studentId currentClass",
  );
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student not found" });
  }

  // Get all assignments for this student
  const assignments = await StandardAssignment.find({
    isActive: true,
    $or: [
      { students: studentId },
      { class: student.currentClass, students: { $size: 0 } },
    ],
  })
    .populate(
      "standard",
      "code name description masteryThreshold masteryMinQuestions",
    )
    .populate("subject", "name code");

  const progressData = await Promise.all(
    assignments.map(async (a) => {
      const mastery = await PracticeAttempt.calculateMastery(
        studentId,
        a.standard._id,
        a.standard.masteryThreshold,
        a.standard.masteryMinQuestions,
        3,
        req.schoolId,
      );

      // Get total attempts count
      const totalAllAttempts = await PracticeAttempt.countDocuments({
        student: studentId,
        standard: a.standard._id,
        status: "answered",
      });

      return {
        assignment: {
          _id: a._id,
          standard: a.standard,
          subject: a.subject,
          assignedDate: a.assignedDate,
          dueDate: a.dueDate,
        },
        mastery,
        totalAllAttempts,
      };
    }),
  );

  res.json({
    success: true,
    data: {
      student,
      progress: progressData,
      summary: {
        totalAssigned: progressData.length,
        mastered: progressData.filter((p) => p.mastery.isMastered).length,
        inProgress: progressData.filter(
          (p) => !p.mastery.isMastered && p.mastery.totalAttempts > 0,
        ).length,
        notStarted: progressData.filter((p) => p.mastery.totalAttempts === 0)
          .length,
      },
    },
  });
});

/**
 * @desc    Get class-wide progress on an assignment (teacher view)
 * @route   GET /api/practice/assignment/:assignmentId/progress
 * @access  Private (Admin, Teacher)
 */
export const getAssignmentProgress = asyncHandler(async (req, res) => {
  const assignment = await StandardAssignment.findById(req.params.assignmentId)
    .populate("standard")
    .populate("class", "name grade section")
    .populate("subject", "name code");

  if (!assignment) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }

  // Get students
  let students;
  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  if (assignmentStudents.length > 0) {
    students = await Student.find({
      _id: { $in: assignmentStudents },
      status: "active",
    }).select("firstName lastName studentId");
  } else {
    students = await Student.find({
      currentClass: assignment.class._id,
      status: "active",
    }).select("firstName lastName studentId");
  }

  const studentsProgress = await Promise.all(
    students.map(async (student) => {
      const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        assignment.standard._id,
        assignment.standard.masteryThreshold,
        assignment.standard.masteryMinQuestions,
        3,
        req.schoolId,
      );
      const totalAttempts = await PracticeAttempt.countDocuments({
        student: student._id,
        standard: assignment.standard._id,
        status: "answered",
      });
      return {
        student: student.toObject(),
        mastery,
        totalAttempts,
      };
    }),
  );

  const masteredCount = studentsProgress.filter(
    (s) => s.mastery.isMastered,
  ).length;

  res.json({
    success: true,
    data: {
      assignment,
      studentsProgress,
      summary: {
        totalStudents: studentsProgress.length,
        mastered: masteredCount,
        inProgress: studentsProgress.filter(
          (s) => !s.mastery.isMastered && s.mastery.totalAttempts > 0,
        ).length,
        notStarted: studentsProgress.filter(
          (s) => s.mastery.totalAttempts === 0,
        ).length,
        masteryRate:
          studentsProgress.length > 0
            ? Math.round((masteredCount / studentsProgress.length) * 100)
            : 0,
      },
    },
  });
});

/**
 * @desc    Log a practice integrity event (tab change, blur, focus)
 * @route   POST /api/practice/integrity-event
 * @access  Private (Student)
 */
export const logIntegrityEvent = asyncHandler(async (req, res) => {
  const body = req.body ?? {};
  let parsed;
  try {
    parsed = integrityEventSchema.safeParse(body);
  } catch (zodError) {
    return res.json({
      success: true,
      data: { eventId: null, ignored: true },
    });
  }
  if (!parsed.success) {
    return res.json({
      success: true,
      data: { eventId: null, ignored: true },
    });
  }

  const student = await Student.findOne({
    user: req.user._id,
    status: "active",
  });
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student profile not found" });
  }

  const assignment = await StandardAssignment.findById(
    parsed.data.assignmentId,
  ).populate("standard");

  if (!assignment || !assignment.isActive) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }

  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  const isAssigned =
    assignmentStudents.length === 0
      ? student.currentClass?.toString() === assignment.class.toString()
      : assignmentStudents.some(
          (s) => s.toString() === student._id.toString(),
        );

  if (!isAssigned) {
    return res
      .status(403)
      .json({
        success: false,
        message: "You are not assigned to this standard",
      });
  }

  const session = await PracticeSession.findOne({
    student: student._id,
    assignment: assignment._id,
    status: "active",
  }).sort({ createdAt: -1 });

  const event = await PracticeIntegrityEvent.create({
    school: req.schoolId,
    student: student._id,
    assignment: assignment._id,
    standard: assignment.standard._id,
    session: session?._id || null,
    attempt: parsed.data.attemptId || null,
    eventType: parsed.data.eventType,
    metadata: parsed.data.metadata || {},
  });

  res.json({
    success: true,
    data: { eventId: event._id },
  });
});

/**
 * @desc    Get integrity events summary for an assignment (teacher/admin)
 * @route   GET /api/practice/integrity/assignment/:assignmentId
 * @access  Private (Admin, Teacher)
 */
export const getIntegrityByAssignment = asyncHandler(async (req, res) => {
  const assignment = await StandardAssignment.findById(req.params.assignmentId)
    .populate("class", "name grade section")
    .populate("standard", "code name");

  if (!assignment) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }

  let students;
  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  if (assignmentStudents.length > 0) {
    students = await Student.find({
      _id: { $in: assignmentStudents },
      status: "active",
    }).select("firstName lastName studentId");
  } else {
    students = await Student.find({
      currentClass: assignment.class._id,
      status: "active",
    }).select("firstName lastName studentId");
  }

  const eventTypes = [
    "tab_hidden",
    "window_blur",
    "visibility_visible",
    "window_focus",
  ];

  const aggregates = await PracticeIntegrityEvent.aggregate([
    { $match: { assignment: assignment._id } },
    {
      $group: {
        _id: { student: "$student", eventType: "$eventType" },
        count: { $sum: 1 },
        lastAt: { $max: "$createdAt" },
      },
    },
  ]);

  const studentMap = new Map();
  students.forEach((student) => {
    const counts = eventTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});
    studentMap.set(student._id.toString(), {
      student: student.toObject(),
      counts,
      totalEvents: 0,
      lastEventAt: null,
    });
  });

  aggregates.forEach((row) => {
    const studentId = row._id.student.toString();
    const entry = studentMap.get(studentId);
    if (!entry) return;
    entry.counts[row._id.eventType] = row.count;
    entry.totalEvents += row.count;
    if (!entry.lastEventAt || row.lastAt > entry.lastEventAt) {
      entry.lastEventAt = row.lastAt;
    }
  });

  res.json({
    success: true,
    data: {
      assignment: {
        _id: assignment._id,
        standard: assignment.standard,
        class: assignment.class,
      },
      students: Array.from(studentMap.values()),
    },
  });
});

/**
 * @desc    Get integrity events summary for a student (teacher/admin)
 * @route   GET /api/practice/integrity/student/:studentId
 * @access  Private (Admin, Teacher)
 */
export const getIntegrityByStudent = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { assignmentId } = req.query;

  const student = await Student.findById(studentId).select(
    "firstName lastName studentId currentClass",
  );
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student not found" });
  }

  const match = { student: student._id };
  if (assignmentId) match.assignment = assignmentId;

  const eventTypes = [
    "tab_hidden",
    "window_blur",
    "visibility_visible",
    "window_focus",
  ];

  const summary = await PracticeIntegrityEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$eventType",
        count: { $sum: 1 },
        lastAt: { $max: "$createdAt" },
      },
    },
  ]);

  const counts = eventTypes.reduce((acc, type) => {
    acc[type] = { count: 0, lastAt: null };
    return acc;
  }, {});

  summary.forEach((row) => {
    counts[row._id] = { count: row.count, lastAt: row.lastAt };
  });

  const recentEvents = await PracticeIntegrityEvent.find(match)
    .sort({ createdAt: -1 })
    .limit(50)
    .select("eventType assignment session attempt createdAt");

  res.json({
    success: true,
    data: {
      student,
      counts,
      recentEvents,
    },
  });
});
