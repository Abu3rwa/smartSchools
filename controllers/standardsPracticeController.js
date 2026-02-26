import PracticeAttempt from "../models/PracticeAttempt.js";
import StandardAssignment from "../models/StandardAssignment.js";
import Student from "../models/Student.js";
import PracticeSession from "../models/PracticeSession.js";
import PracticeIntegrityEvent from "../models/PracticeIntegrityEvent.js";
import MasteryRecord from "../models/MasteryRecord.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import standardsPracticeAIService from "../services/standardsPracticeAIService.js";
import { scheduleFromAttempt } from "../services/reviewSchedulerService.js";
import { upsertInterventionCase } from "../services/interventionQueueService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAIUsage } from "../utils/aiUsageTracker.js";
import logger from "../utils/logger.js";
import {
  getClassIdsForAcademicYear,
  isClassInAcademicYear,
  resolveAcademicYearForRequest,
} from "../helpers/academicYearScope.js";
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

const DEFAULT_ASSESSMENT_CONFIG = {
  maxMarks: 100,
  passMarks: 40,
  resultsVisibility: "immediate",
  resultsReleaseAt: null,
};

const resolveSemesterFromDate = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const month = date.getMonth() + 1;
  return month >= 8 ? 1 : 2;
};

const normalizeSemester = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const semester = Math.trunc(parsed);
  return [1, 2].includes(semester) ? semester : null;
};

const resolveSemesterForRequest = (req) => {
  const fromQuery = normalizeSemester(req?.query?.semester);
  if (fromQuery) return fromQuery;
  const fromHeader = normalizeSemester(req?.headers?.["x-semester"]);
  if (fromHeader) return fromHeader;
  return resolveSemesterFromDate(new Date());
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
    (Date.now() - new Date(session.startedAt).getTime()) / 1000
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
      (item) => (item?.label || "").trim().toUpperCase() === normalized
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

const CONTEXT_STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "this",
  "that",
  "which",
  "what",
  "when",
  "where",
  "why",
  "how",
  "from",
  "your",
  "you",
  "student",
]);

const normalizeFingerprintSource = (text = "") =>
  String(text || "")
    .toLowerCase()
    .replace(/[`*_#>\-~]/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const buildQuestionFingerprint = (text = "") =>
  normalizeFingerprintSource(text)
    .split(" ")
    .filter((token) => token && !CONTEXT_STOP_WORDS.has(token))
    .slice(0, 40)
    .join(" ");

const tokenizeForSemanticCheck = (text = "") =>
  normalizeFingerprintSource(text)
    .split(" ")
    .filter((token) => token && !CONTEXT_STOP_WORDS.has(token));

const semanticSimilarity = (leftText = "", rightText = "") => {
  const leftSet = new Set(tokenizeForSemanticCheck(leftText));
  const rightSet = new Set(tokenizeForSemanticCheck(rightText));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  let intersection = 0;
  leftSet.forEach((token) => {
    if (rightSet.has(token)) intersection += 1;
  });
  const union = leftSet.size + rightSet.size - intersection;
  return union > 0 ? intersection / union : 0;
};

const extractTopicFromQuestion = (text = "") => {
  const tokens = tokenizeForSemanticCheck(text).slice(0, 6);
  return tokens.length > 0 ? tokens.join(" ") : null;
};

const dedupeStrings = (items = [], limit = 5) => {
  const seen = new Set();
  const result = [];
  items.forEach((item) => {
    const clean = String(item || "").trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (result.length < limit) result.push(clean);
  });
  return result;
};

const buildSessionContextHints = (attempts = []) => {
  const previousQuestions = [];
  attempts.forEach((attempt) => {
    const questionText = String(attempt?.questionText || "").trim();
    if (!questionText) return;
    const isNearDuplicate = previousQuestions.some(
      (existing) => semanticSimilarity(existing, questionText) >= 0.9,
    );
    if (!isNearDuplicate) {
      previousQuestions.push(questionText);
    }
  });
  const previousQuestionFingerprints = dedupeStrings(
    previousQuestions.map((q) => buildQuestionFingerprint(q)).filter(Boolean),
    40,
  );
  const recentTopics = dedupeStrings(
    attempts
      .map(
        (attempt) =>
          attempt?.feedbackParts?.reviewTag ||
          extractTopicFromQuestion(attempt?.questionText || ""),
      )
      .filter(Boolean),
    5,
  );
  const recentMistakes = dedupeStrings(
    attempts
      .filter((attempt) => attempt?.status === "answered" && !attempt?.isCorrect)
      .flatMap((attempt) => {
        const missingConcepts = attempt?.feedbackParts?.conceptChecks?.missing;
        if (Array.isArray(missingConcepts) && missingConcepts.length > 0) {
          return missingConcepts;
        }
        const tag =
          attempt?.feedbackParts?.reviewTag ||
          extractTopicFromQuestion(attempt?.questionText || "");
        return tag ? [tag] : [];
      }),
    4,
  );

  const answeredAttempts = attempts.filter((attempt) => attempt?.status === "answered");
  const recentPerformance = computeRecentPerformance(
    answeredAttempts.map((attempt) => ({ isCorrect: Boolean(attempt?.isCorrect) })),
  );
  const recentWindow = answeredAttempts.slice(0, 5);
  const recentCorrect = recentWindow.filter((attempt) => attempt?.isCorrect).length;
  const recentAccuracy =
    recentWindow.length > 0 ? Math.round((recentCorrect / recentWindow.length) * 100) : 0;
  const confidenceHint =
    recentWindow.length === 0
      ? "Build momentum with your first question."
      : recentAccuracy >= 80
        ? "You are showing strong confidence."
        : recentAccuracy >= 50
          ? "You are building confidence with practice."
          : "Focus on one key step at a time.";

  return {
    previousQuestions,
    previousQuestionFingerprints,
    recentTopics,
    recentMistakes,
    recentAccuracy,
    confidenceHint,
    correctStreak: recentPerformance.correctStreak,
    incorrectStreak: recentPerformance.incorrectStreak,
  };
};

const resolveHighestDifficulty = (current, incoming) => {
  if (!incoming || !DIFFICULTY_RANK[incoming]) return current || null;
  if (!current || !DIFFICULTY_RANK[current]) return incoming;
  return DIFFICULTY_RANK[incoming] > DIFFICULTY_RANK[current]
    ? incoming
    : current;
};

const getAssessmentConfig = (assignment) => {
  const cfg = assignment?.assessmentConfig || {};
  return {
    maxMarks: Number(cfg.maxMarks || DEFAULT_ASSESSMENT_CONFIG.maxMarks),
    passMarks: Number(cfg.passMarks || DEFAULT_ASSESSMENT_CONFIG.passMarks),
    resultsVisibility:
      cfg.resultsVisibility || DEFAULT_ASSESSMENT_CONFIG.resultsVisibility,
    resultsReleaseAt: cfg.resultsReleaseAt || null,
  };
};

const resolveProgressStatus = (mastery) => {
  if (!mastery) return "not_started";
  if (mastery?.masteryStatus === "needs_review" || mastery?.needsReview)
    return "needs_review";
  if (mastery?.isMastered) return "mastered";
  if ((mastery?.totalAttempts || 0) > 0) return "in_progress";
  return "not_started";
};

const getProgressSummaryFromRows = (rows = [], accessor) => {
  const summary = {
    total: rows.length,
    mastered: 0,
    inProgress: 0,
    notStarted: 0,
    needsReview: 0,
  };
  rows.forEach((row) => {
    const status = accessor(row);
    if (status === "mastered") summary.mastered += 1;
    else if (status === "needs_review") summary.needsReview += 1;
    else if (status === "in_progress") summary.inProgress += 1;
    else summary.notStarted += 1;
  });
  return summary;
};

const buildAssessmentScore = ({ correctCount, totalAnswered, maxMarks }) => {
  const safeAnswered = Math.max(0, Number(totalAnswered || 0));
  const safeCorrect = Math.max(0, Number(correctCount || 0));
  const safeMaxMarks = Math.max(1, Number(maxMarks || DEFAULT_ASSESSMENT_CONFIG.maxMarks));
  const percentage = safeAnswered > 0
    ? Number(((safeCorrect / safeAnswered) * 100).toFixed(2))
    : 0;
  const score = Number(((percentage / 100) * safeMaxMarks).toFixed(2));
  return { score, percentage };
};

const percentageToScale4 = (percentageValue) => {
  const pct = Math.max(0, Math.min(100, Number(percentageValue || 0)));
  return Number((pct / 25).toFixed(2));
};

const upsertAssessmentGradebookProgress = async ({
  schoolId,
  assignment,
  studentId,
  sessionId = null,
  status = "in_progress",
  submittedAt = null,
}) => {
  const answeredAttempts = await PracticeAttempt.find({
    school: schoolId,
    student: studentId,
    assignment: assignment._id,
    status: "answered",
    ...(sessionId ? { session: sessionId } : {}),
  })
    .select("isCorrect")
    .lean();

  const totalAnswered = answeredAttempts.length;
  const correctCount = answeredAttempts.filter((a) => a.isCorrect).length;
  const assessmentConfig = getAssessmentConfig(assignment);
  const { score, percentage } = buildAssessmentScore({
    correctCount,
    totalAnswered,
    maxMarks: assessmentConfig.maxMarks,
  });

  const update = {
    standard: assignment.standard?._id || assignment.standard,
    class: assignment.class?._id || assignment.class,
    subject: assignment.subject?._id || assignment.subject,
    academicYear: assignment.academicYear || null,
    semester: assignment.semester || null,
    session: sessionId || null,
    status,
    totalAnswered,
    correctCount,
    score,
    maxScore: assessmentConfig.maxMarks,
    percentage,
    metadata: {
      passMarks: assessmentConfig.passMarks,
      resultsVisibility: assessmentConfig.resultsVisibility,
      resultsReleaseAt: assessmentConfig.resultsReleaseAt || null,
    },
  };
  if (submittedAt) {
    update.submittedAt = submittedAt;
  }

  return StandardsGradebookEntry.findOneAndUpdate(
    { school: schoolId, assignment: assignment._id, student: studentId },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const getYearScopedClassIds = async (req, candidateClassIds = null) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const classIds = await getClassIdsForAcademicYear({
    schoolId: req.schoolId,
    academicYear: effectiveAcademicYear,
    candidateClassIds,
  });
  return {
    effectiveAcademicYear,
    classIds,
  };
};

const getYearScopedAssignmentIds = async ({
  schoolId,
  classIds = [],
  standardId = null,
  semester = null,
}) => {
  if (!Array.isArray(classIds) || classIds.length === 0) return [];

  const query = {
    school: schoolId,
    isActive: true,
    class: { $in: classIds },
  };
  if (standardId) query.standard = standardId;
  const normalizedSemester = normalizeSemester(semester);
  if (normalizedSemester) {
    query.$or = [
      { semester: normalizedSemester },
      { semester: { $exists: false } },
      { semester: null },
    ];
  }

  const assignments = await StandardAssignment.find(query).select("_id").lean();
  return assignments.map((item) => item._id);
};

const upsertMasteryRecord = async (
  schoolId,
  studentId,
  standardId,
  mastery,
  recentDifficulty
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
    isMastered ? recentDifficulty : null
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
    }
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
  const byDifficulty = {
    easy: { total: 0, correct: 0 },
    medium: { total: 0, correct: 0 },
    hard: { total: 0, correct: 0 },
  };
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
  const accuracy =
    stats.total >= 3 ? (stats.correct / stats.total) * 100 : null;

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

  const recentTypeCounts = recentAttempts.slice(0, 4).reduce((acc, attempt) => {
    if (attempt?.questionType) {
      acc[attempt.questionType] = (acc[attempt.questionType] || 0) + 1;
    }
    return acc;
  }, {});

  let chosen = allowed[0];
  let lowestScore = Number.POSITIVE_INFINITY;
  allowed.forEach((type) => {
    const total = stats[type].total;
    const accuracy = total > 0 ? (stats[type].correct / total) * 100 : 0;
    const repetitionPenalty = (recentTypeCounts[type] || 0) * 8;
    const score = accuracy + repetitionPenalty;
    if (score < lowestScore) {
      lowestScore = score;
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
    recentAttempts
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

  const { effectiveAcademicYear, classIds: yearClassIds } =
    await getYearScopedClassIds(req);
  const effectiveSemester = resolveSemesterForRequest(req);

  if (yearClassIds.length === 0) {
    return res.json({
      success: true,
      data: {
        studentId: student._id,
        studentClass: student.currentClass,
        assignments: [],
        academicYear: effectiveAcademicYear,
      },
    });
  }

  // Find assignments where student is specifically listed OR assigned to the whole class.
  // Note: for older records, `students` might be missing/null; treat that as "whole class".
  const classId = student.currentClass?._id || student.currentClass;
  const normalizedClassId = classId ? classId.toString() : null;
  const isStudentClassInYear = normalizedClassId
    ? yearClassIds.some((id) => id === normalizedClassId)
    : false;

  const orConditions = [{ students: student._id }];
  if (classId && isStudentClassInYear) {
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
    class: { $in: yearClassIds },
    $or: orConditions,
    $and: [
      {
        $or: [
          { semester: effectiveSemester },
          { semester: { $exists: false } },
          { semester: null },
        ],
      },
    ],
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
        [a._id]
      );
      return {
        ...a.toObject(),
        mastery,
        progressStatus: resolveProgressStatus(mastery),
      };
    })
  );

  res.json({
    success: true,
    data: {
      studentId: student._id,
      studentClass: student.currentClass,
      assignments: assignmentsWithProgress,
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester,
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);

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
    .populate("class", "academicYear")
    .populate("subject", "name code");

  if (!assignment || !assignment.isActive) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment is not available in academic year ${effectiveAcademicYear}`,
    });
  }

  // Verify student is part of this assignment
  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  const assignmentClassId = assignment.class?._id || assignment.class;
  const isAssigned =
    assignmentStudents.length === 0
      ? student.currentClass?.toString() === assignmentClassId?.toString()
      : assignmentStudents.some((s) => s.toString() === student._id.toString());

  if (!isAssigned) {
    return res.status(403).json({
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
    [assignment._id]
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

  const sessionAttempts = await PracticeAttempt.find({
    school: req.schoolId,
    student: student._id,
    assignment: assignment._id,
    session: session._id,
  })
    .select("questionText questionType difficulty isCorrect status feedbackParts")
    .sort({ createdAt: -1 })
    .limit(Math.max(ACCURACY_WINDOW, 25))
    .lean();
  const sessionContext = buildSessionContextHints(sessionAttempts);
  const previousQuestions = sessionContext.previousQuestions;
  const previousQuestionFingerprints =
    sessionContext.previousQuestionFingerprints;

  // Count attempt number
  const attemptCount = await PracticeAttempt.countDocuments({
    student: student._id,
    assignment: assignment._id,
  });

  let recentAttempts = sessionAttempts.filter(
    (attempt) => attempt.status === "answered",
  );
  if (recentAttempts.length === 0) {
    recentAttempts = await PracticeAttempt.find({
      school: req.schoolId,
      student: student._id,
      assignment: assignment._id,
      status: "answered",
    })
      .select("questionType difficulty isCorrect status")
      .sort({ createdAt: -1 })
      .limit(ACCURACY_WINDOW)
      .lean();
  }

  const {
    questionType: effectiveQuestionType,
    difficulty: effectiveDifficulty,
    suggestRemediation,
  } = resolveQuestionSettings({
    requestedDifficulty: difficulty,
    requestedQuestionType: questionType,
    config: practiceConfig,
    recentAttempts: recentAttempts.slice(0, ACCURACY_WINDOW),
  });

  const subjectName = assignment.subject?.name || "General Studies";

  // Generate question
  const question = await standardsPracticeAIService.generateQuestion({
    standard: assignment.standard,
    subjectName,
    difficulty: effectiveDifficulty,
    questionType: effectiveQuestionType,
    previousQuestions,
    previousQuestionFingerprints,
    recentAttempts: sessionAttempts.slice(0, 12),
    studentFirstName: student.firstName || "",
    contextHints: {
      recentTopics: sessionContext.recentTopics,
      recentMistakes: sessionContext.recentMistakes,
      confidenceHint: sessionContext.confidenceHint,
    },
    attemptNumber: attemptCount + 1,
  });

  // Log AI usage
  if (question.tokenUsage && question.tokenUsage.total > 0) {
    await logAIUsage({
      model: "gemini-2.5-flash-lite",
      feature: "practice_question",
      schoolId: req.schoolId,
      userId: req.user._id,
      studentId: student._id,
      entityType: "StandardAssignment",
      entityId: assignment._id,
      metadata: {
        questionType: effectiveQuestionType,
        difficulty: effectiveDifficulty,
        standardId: assignment.standard._id,
      },
      response: {
        inputtokenCount: question.tokenUsage.input,
        outputtokenCount: question.tokenUsage.output,
        totalTokenCount: question.tokenUsage.total,
      },
    });
  }

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
    sessionContext: {
      recentTopics: sessionContext.recentTopics,
      recentMistakes: sessionContext.recentMistakes,
      confidenceHint: sessionContext.confidenceHint,
      recentAccuracy: sessionContext.recentAccuracy,
      correctStreak: sessionContext.correctStreak,
      incorrectStreak: sessionContext.incorrectStreak,
    },
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);

  if (!attemptId || answer === undefined || answer === null) {
    return res
      .status(400)
      .json({ success: false, message: "attemptId and answer are required" });
  }

  // Find the attempt
  const attempt = await PracticeAttempt.findById(attemptId)
    .populate(
      "standard",
      "code name description gradeLevel masteryThreshold masteryMinQuestions"
    )
    .populate({
      path: "assignment",
      select: "subject class",
      populate: [
        {
          path: "subject",
          select: "name code",
        },
        {
          path: "class",
          select: "academicYear",
        },
      ],
    });
  if (!attempt) {
    return res
      .status(404)
      .json({ success: false, message: "Practice attempt not found" });
  }

  if (attempt.status !== "pending") {
    return res.status(400).json({
      success: false,
      message: "This question has already been answered",
    });
  }
  const assignmentClassYear = attempt.assignment?.class?.academicYear || null;
  if (assignmentClassYear && assignmentClassYear !== effectiveAcademicYear) {
    return res.status(400).json({
      success: false,
      message: `This attempt belongs to academic year ${assignmentClassYear} and cannot be submitted in ${effectiveAcademicYear}.`,
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
    ...(attempt.session ? { session: attempt.session } : {}),
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

  if (evaluation.tokenUsage && evaluation.tokenUsage.total > 0) {
    await logAIUsage({
      model: "gemini-2.5-flash-lite",
      feature: "practice_evaluate_answer",
      schoolId: req.schoolId,
      userId: req.user._id,
      studentId: student._id,
      entityType: "PracticeAttempt",
      entityId: attempt._id,
      metadata: {
        questionType: attempt.questionType,
        difficulty: attempt.difficulty,
        isCorrect: evaluation.isCorrect,
        standardId: attempt.standard._id,
      },
      response: {
        inputtokenCount: evaluation.tokenUsage.input,
        outputtokenCount: evaluation.tokenUsage.output,
        totalTokenCount: evaluation.tokenUsage.total,
      },
    });
  }

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
    [attempt.assignment?._id || attempt.assignment]
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
    attempt.difficulty
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

  if (attempt.sessionType === "assessment") {
    const assessmentAssignment = await StandardAssignment.findById(
      attempt.assignment?._id || attempt.assignment
    ).select("assessmentConfig standard class subject academicYear semester");
    if (assessmentAssignment) {
      const assessmentStatus =
        session && session.status !== "active" ? "submitted" : "in_progress";
      await upsertAssessmentGradebookProgress({
        schoolId: req.schoolId,
        assignment: assessmentAssignment,
        studentId: student._id,
        sessionId: attempt.session || session?._id || null,
        status: assessmentStatus,
        submittedAt: assessmentStatus === "submitted" ? new Date() : null,
      });
    }
  }

  const correctAnswerDisplay = resolveDisplayAnswer(
    attempt.correctAnswer,
    attempt.options || []
  );
  const sessionContextAttempts = await PracticeAttempt.find({
    school: req.schoolId,
    student: student._id,
    assignment: attempt.assignment?._id || attempt.assignment,
    ...(attempt.session ? { session: attempt.session } : {}),
  })
    .select("questionText questionType difficulty isCorrect status feedbackParts")
    .sort({ createdAt: -1 })
    .limit(Math.max(10, ACCURACY_WINDOW))
    .lean();
  const sessionContext = buildSessionContextHints(sessionContextAttempts);

  if (process.env.REVIEW_QUEUE_ENABLED !== "false") {
    try {
      await scheduleFromAttempt({ attempt });
    } catch (error) {
      logger.error("review_task_schedule_failed", {
        attemptId: attempt._id,
        studentId: student._id,
        standardId: attempt.standard?._id || attempt.standard,
        error: error?.message || String(error),
      });
    }
  }

  if (process.env.INTERVENTION_QUEUE_ENABLED !== "false") {
    try {
      await upsertInterventionCase({
        schoolId: req.schoolId,
        studentId: student._id,
        standardId: attempt.standard?._id || attempt.standard,
        assignmentId: attempt.assignment?._id || attempt.assignment || null,
        classId: attempt.assignment?.class?._id || attempt.assignment?.class || null,
        subjectId: attempt.assignment?.subject?._id || attempt.assignment?.subject || null,
        sessionContext: {
          recentTopics: sessionContext.recentTopics,
          recentMistakes: sessionContext.recentMistakes,
          recentAccuracy: sessionContext.recentAccuracy,
          correctStreak: sessionContext.correctStreak,
          incorrectStreak: sessionContext.incorrectStreak,
        },
      });
    } catch (error) {
      logger.error("intervention_case_upsert_failed", {
        attemptId: attempt._id,
        studentId: student._id,
        standardId: attempt.standard?._id || attempt.standard,
        error: error?.message || String(error),
      });
    }
  }

  const payload = submitAnswerResponseSchema.parse({
    isCorrect: evaluation.isCorrect,
    correctAnswer: attempt.correctAnswer,
    correctAnswerDisplay,
    explanation: attempt.explanation || null,
    feedback: evaluation.feedback || null,
    feedbackParts: evaluation.feedbackParts || null,
    studentFirstName: student.firstName || null,
    sessionContext: {
      recentTopics: sessionContext.recentTopics,
      recentMistakes: sessionContext.recentMistakes,
      confidenceHint: sessionContext.confidenceHint,
      recentAccuracy: sessionContext.recentAccuracy,
      correctStreak: sessionContext.correctStreak,
      incorrectStreak: sessionContext.incorrectStreak,
    },
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
  const effectiveSemester = resolveSemesterForRequest(req);
  const { effectiveAcademicYear, classIds: yearClassIds } =
    await getYearScopedClassIds(req);
  const student = await Student.findOne({ user: req.user._id });
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student profile not found" });
  }

  const { page = 1, limit = 20 } = req.query;
  const yearAssignmentIds = await getYearScopedAssignmentIds({
    schoolId: req.schoolId,
    classIds: yearClassIds,
    standardId: req.params.standardId,
    semester: effectiveSemester,
  });

  if (yearAssignmentIds.length === 0) {
    return res.json({
      success: true,
      data: {
        attempts: [],
        mastery: {
          totalAttempts: 0,
          correctCount: 0,
          percentage: 0,
          masteryStatus: "not_started",
          isMastered: false,
          needsReview: false,
          confidenceScore: 0,
        },
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0,
        },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const query = {
    school: req.schoolId,
    student: student._id,
    standard: req.params.standardId,
    assignment: { $in: yearAssignmentIds },
    status: "answered",
  };

  const attemptsRaw = await PracticeAttempt.find(query)
    .select(
      "questionText questionType studentAnswer correctAnswer options isCorrect explanation feedback feedbackParts difficulty attemptNumber answeredAt timeSpentSeconds"
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
    yearAssignmentIds
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
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester,
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
  const effectiveSemester = resolveSemesterForRequest(req);
  const { effectiveAcademicYear, classIds: yearClassIds } =
    await getYearScopedClassIds(req);

  const student = await Student.findById(studentId).select(
    "firstName lastName studentId currentClass"
  );
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student not found" });
  }
  if (yearClassIds.length === 0) {
    return res.json({
      success: true,
      data: {
        student,
        progress: [],
        summary: {
          totalAssigned: 0,
          mastered: 0,
          inProgress: 0,
          notStarted: 0,
        },
        academicYear: effectiveAcademicYear,
      },
    });
  }

  // Get all assignments for this student
  const studentClassId = student.currentClass?.toString();
  const isStudentClassInYear = studentClassId
    ? yearClassIds.some((id) => id === studentClassId)
    : false;
  const assignmentOrConditions = [{ students: studentId }];
  if (isStudentClassInYear) {
    assignmentOrConditions.push({
      class: student.currentClass,
      students: { $size: 0 },
    });
  }

  const assignments = await StandardAssignment.find({
    isActive: true,
    class: { $in: yearClassIds },
    $or: assignmentOrConditions,
    $and: [
      {
        $or: [
          { semester: effectiveSemester },
          { semester: { $exists: false } },
          { semester: null },
        ],
      },
    ],
  })
    .populate(
      "standard",
      "code name description masteryThreshold masteryMinQuestions"
    )
    .populate("subject", "name code")
    .populate("class", "name grade section academicYear");

  const progressData = await Promise.all(
    assignments.map(async (a) => {
      const mastery = await PracticeAttempt.calculateMastery(
        studentId,
        a.standard._id,
        a.standard.masteryThreshold,
        a.standard.masteryMinQuestions,
        3,
        req.schoolId,
        [a._id]
      );

      // Get total attempts count
      const totalAllAttempts = await PracticeAttempt.countDocuments({
        student: studentId,
        assignment: a._id,
        status: "answered",
      });
      const progressStatus = resolveProgressStatus(mastery);

      return {
        assignment: {
          _id: a._id,
          title: a.title || null,
          standard: a.standard,
          subject: a.subject,
          class: a.class,
          assignedDate: a.assignedDate,
          dueDate: a.dueDate,
        },
        mastery,
        progressStatus,
        totalAllAttempts,
      };
    })
  );

  const summaryCounts = getProgressSummaryFromRows(
    progressData,
    (item) => item.progressStatus
  );

  res.json({
    success: true,
    data: {
      student,
      progress: progressData,
      summary: {
        totalAssigned: progressData.length,
        mastered: summaryCounts.mastered,
        inProgress: summaryCounts.inProgress,
        notStarted: summaryCounts.notStarted,
        needsReview: summaryCounts.needsReview,
      },
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester,
    },
  });
});

/**
 * @desc    Get class-wide progress on an assignment (teacher view)
 * @route   GET /api/practice/assignment/:assignmentId/progress
 * @access  Private (Admin, Teacher)
 */
export const getAssignmentProgress = asyncHandler(async (req, res) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const assignment = await StandardAssignment.findById(req.params.assignmentId)
    .populate("standard")
    .populate("class", "name grade section academicYear")
    .populate("subject", "name code");

  if (!assignment) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment not found for academic year ${effectiveAcademicYear}`,
    });
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
      academicYear: effectiveAcademicYear,
    }).select("firstName lastName studentId");
  } else {
    students = await Student.find({
      currentClass: assignment.class._id,
      status: "active",
      academicYear: effectiveAcademicYear,
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
        [assignment._id]
      );
      const totalAttempts = await PracticeAttempt.countDocuments({
        student: student._id,
        assignment: assignment._id,
        status: "answered",
      });
      const progressStatus = resolveProgressStatus(mastery);
      return {
        student: student.toObject(),
        mastery,
        progressStatus,
        totalAttempts,
      };
    })
  );

  const summaryCounts = getProgressSummaryFromRows(
    studentsProgress,
    (item) => item.progressStatus
  );

  res.json({
    success: true,
    data: {
      assignment,
      studentsProgress,
      summary: {
        totalStudents: studentsProgress.length,
        mastered: summaryCounts.mastered,
        inProgress: summaryCounts.inProgress,
        notStarted: summaryCounts.notStarted,
        needsReview: summaryCounts.needsReview,
        masteryRate:
          studentsProgress.length > 0
            ? Math.round((summaryCounts.mastered / studentsProgress.length) * 100)
            : 0,
      },
      academicYear: effectiveAcademicYear,
      semester: assignment.semester || null,
    },
  });
});

/**
 * @desc    Finalize standards assessment and write to SB gradebook
 * @route   POST /api/practice/assessment/finalize
 * @access  Private (Student)
 */
export const finalizeAssessment = asyncHandler(async (req, res) => {
  const { assignmentId } = req.body || {};
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  if (!assignmentId) {
    return res.status(400).json({
      success: false,
      message: "assignmentId is required",
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

  const assignment = await StandardAssignment.findById(assignmentId)
    .populate("class", "academicYear")
    .populate("subject", "name code")
    .populate("standard", "code name");
  if (!assignment || !assignment.isActive) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment is not available in academic year ${effectiveAcademicYear}`,
    });
  }

  const practiceConfig = getAssignmentPracticeConfig(assignment);
  if (practiceConfig.sessionType !== "assessment") {
    return res.status(400).json({
      success: false,
      message: "This assignment is not configured as an assessment",
    });
  }

  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  const assignmentClassId = assignment.class?._id || assignment.class;
  const isAssigned =
    assignmentStudents.length === 0
      ? student.currentClass?.toString() === assignmentClassId?.toString()
      : assignmentStudents.some((s) => s.toString() === student._id.toString());
  if (!isAssigned) {
    return res.status(403).json({
      success: false,
      message: "You are not assigned to this assessment",
    });
  }

  const session = await PracticeSession.findOne({
    school: req.schoolId,
    student: student._id,
    assignment: assignment._id,
    status: { $in: ["active", "completed", "expired"] },
  }).sort({ createdAt: -1 });

  if (!session) {
    return res.status(400).json({
      success: false,
      message: "No assessment session found to finalize",
    });
  }

  if (session.status === "active") {
    session.status = "completed";
    session.endedAt = new Date();
    await session.save();
  }

  const entry = await upsertAssessmentGradebookProgress({
    schoolId: req.schoolId,
    assignment,
    studentId: student._id,
    sessionId: session._id,
    status: "submitted",
    submittedAt: new Date(),
  });

  const assessmentConfig = getAssessmentConfig(assignment);
  const now = new Date();
  const hasReleaseDate = Boolean(assessmentConfig.resultsReleaseAt);
  const isReleaseDateReached =
    hasReleaseDate &&
    now.getTime() >= new Date(assessmentConfig.resultsReleaseAt).getTime();
  const canViewResult =
    assessmentConfig.resultsVisibility === "immediate" || isReleaseDateReached;

  res.json({
    success: true,
    data: {
      assignmentId: assignment._id,
      sessionId: session._id,
      status: entry.status,
      submittedAt: entry.submittedAt,
      resultsVisible: canViewResult,
      result: canViewResult
        ? {
            score: entry.score,
            maxScore: entry.maxScore,
            percentage: entry.percentage,
            passMarks: assessmentConfig.passMarks,
            isPassed: entry.score >= assessmentConfig.passMarks,
          }
        : null,
    },
  });
});

/**
 * @desc    Get student's SB assessment results (semester scoped)
 * @route   GET /api/practice/assessment/my-results
 * @access  Private (Student)
 */
export const getMyAssessmentResults = asyncHandler(async (req, res) => {
  const effectiveSemester = resolveSemesterForRequest(req);
  const { effectiveAcademicYear, classIds: yearClassIds } =
    await getYearScopedClassIds(req);

  const student = await Student.findOne({
    user: req.user._id,
    status: "active",
  }).populate("currentClass", "name grade section academicYear");
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student profile not found" });
  }

  if (!Array.isArray(yearClassIds) || yearClassIds.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        standardAverages: [],
        summary: {
          totalAssessments: 0,
          gradedCount: 0,
          averagePercentage: 0,
          averageScale4: 0,
        },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const classId = student.currentClass?._id || student.currentClass;
  const normalizedClassId = classId ? classId.toString() : null;
  const isStudentClassInYear = normalizedClassId
    ? yearClassIds.some((id) => id === normalizedClassId)
    : false;
  const assignmentOrConditions = [{ students: student._id }];
  if (classId && isStudentClassInYear) {
    assignmentOrConditions.push({
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
    class: { $in: yearClassIds },
    $or: assignmentOrConditions,
    $and: [
      {
        $or: [
          { semester: effectiveSemester },
          { semester: { $exists: false } },
          { semester: null },
        ],
      },
    ],
  })
    .populate("standard", "code name")
    .populate("subject", "name code")
    .populate("class", "name grade section academicYear")
    .sort({ createdAt: -1 })
    .lean();

  if (assignments.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        standardAverages: [],
        summary: {
          totalAssessments: 0,
          gradedCount: 0,
          averagePercentage: 0,
          averageScale4: 0,
        },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const assessmentAssignments = assignments.filter(
    (assignment) =>
      getAssignmentPracticeConfig(assignment).sessionType === "assessment"
  );
  if (assessmentAssignments.length === 0) {
    return res.json({
      success: true,
      data: {
        items: [],
        standardAverages: [],
        summary: {
          totalAssessments: 0,
          gradedCount: 0,
          averagePercentage: 0,
          averageScale4: 0,
        },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const assignmentMap = new Map(
    assessmentAssignments.map((assignment) => [assignment._id.toString(), assignment])
  );
  const assignmentIds = assessmentAssignments.map((assignment) => assignment._id);

  const entries = await StandardsGradebookEntry.find({
    school: req.schoolId,
    student: student._id,
    assignment: { $in: assignmentIds },
  })
    .select(
      "assignment status score maxScore percentage submittedAt releasedAt totalAnswered correctCount"
    )
    .lean();
  const entryMap = new Map(entries.map((entry) => [entry.assignment.toString(), entry]));

  const now = new Date();
  const items = [];
  for (const assignment of assessmentAssignments) {
    const assignmentId = assignment._id.toString();
    const entry = entryMap.get(assignmentId) || null;
    const assessmentConfig = getAssessmentConfig(assignment);
    const hasReleaseDate = Boolean(assessmentConfig.resultsReleaseAt);
    const releaseReached =
      hasReleaseDate &&
      now.getTime() >= new Date(assessmentConfig.resultsReleaseAt).getTime();
    const isVisible =
      assessmentConfig.resultsVisibility === "immediate" ||
      releaseReached ||
      entry?.status === "released";

    const score = isVisible ? entry?.score ?? null : null;
    const maxScore = isVisible ? entry?.maxScore ?? assessmentConfig.maxMarks : null;
    const percentage = isVisible ? entry?.percentage ?? null : null;
    const scale4 = Number.isFinite(percentage) ? percentageToScale4(percentage) : null;

    items.push({
      assignmentId,
      title: assignment.title || `${assignment.standard?.code || "STD"} Assessment`,
      standard: assignment.standard || null,
      subject: assignment.subject || null,
      class: assignment.class || null,
      academicYear: assignment.academicYear || assignment.class?.academicYear || effectiveAcademicYear,
      semester: assignment.semester || effectiveSemester,
      status: entry?.status || "not_started",
      totalAnswered: entry?.totalAnswered ?? 0,
      correctCount: entry?.correctCount ?? 0,
      score,
      maxScore,
      percentage,
      scale4,
      isPassed:
        Number.isFinite(score) &&
        Number.isFinite(assessmentConfig.passMarks) &&
        score >= assessmentConfig.passMarks,
      passMarks: assessmentConfig.passMarks,
      submittedAt: entry?.submittedAt || null,
      releasedAt: entry?.releasedAt || null,
      resultsVisible: isVisible,
    });
  }

  const gradedItems = items.filter((item) => Number.isFinite(item.percentage));
  const averagePercentage = gradedItems.length > 0
    ? Number(
        (
          gradedItems.reduce((sum, item) => sum + Number(item.percentage || 0), 0) /
          gradedItems.length
        ).toFixed(2)
      )
    : 0;
  const averageScale4 = Number((averagePercentage / 25).toFixed(2));

  const standardAccumulator = new Map();
  for (const item of gradedItems) {
    const standardId = item.standard?._id?.toString() || "unknown";
    if (!standardAccumulator.has(standardId)) {
      standardAccumulator.set(standardId, {
        standardId,
        standardCode: item.standard?.code || "N/A",
        standardName: item.standard?.name || "Standard",
        totalAssessments: 0,
        totalPercentage: 0,
      });
    }
    const aggregate = standardAccumulator.get(standardId);
    aggregate.totalAssessments += 1;
    aggregate.totalPercentage += Number(item.percentage || 0);
  }

  const standardAverages = Array.from(standardAccumulator.values()).map((item) => {
    const averagePct =
      item.totalAssessments > 0
        ? Number((item.totalPercentage / item.totalAssessments).toFixed(2))
        : 0;
    return {
      standardId: item.standardId,
      standardCode: item.standardCode,
      standardName: item.standardName,
      totalAssessments: item.totalAssessments,
      averagePercentage: averagePct,
      averageScale4: percentageToScale4(averagePct),
    };
  });

  res.json({
    success: true,
    data: {
      items,
      standardAverages,
      summary: {
        totalAssessments: items.length,
        gradedCount: gradedItems.length,
        averagePercentage,
        averageScale4,
      },
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester,
    },
  });
});

/**
 * @desc    Get Standards-Based assessment gradebook (separate from regular gradebook)
 * @route   GET /api/practice/assessment/:assignmentId/gradebook
 * @access  Private (Admin, Teacher)
 */
export const getAssessmentGradebook = asyncHandler(async (req, res) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const assignment = await StandardAssignment.findById(req.params.assignmentId)
    .populate("standard", "code name")
    .populate("class", "name grade section academicYear")
    .populate("subject", "name code");

  if (!assignment) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment not found for academic year ${effectiveAcademicYear}`,
    });
  }

  const practiceConfig = getAssignmentPracticeConfig(assignment);
  if (practiceConfig.sessionType !== "assessment") {
    return res.status(400).json({
      success: false,
      message: "This assignment is not an assessment",
    });
  }

  let students;
  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  if (assignmentStudents.length > 0) {
    students = await Student.find({
      _id: { $in: assignmentStudents },
      status: "active",
      academicYear: effectiveAcademicYear,
    }).select("firstName lastName studentId");
  } else {
    students = await Student.find({
      currentClass: assignment.class._id,
      status: "active",
      academicYear: effectiveAcademicYear,
    }).select("firstName lastName studentId");
  }

  const entries = await StandardsGradebookEntry.find({
    school: req.schoolId,
    assignment: assignment._id,
  })
    .select(
      "student status totalAnswered correctCount score maxScore percentage submittedAt releasedAt academicYear semester"
    )
    .lean();
  const entryByStudent = new Map(
    entries.map((entry) => [entry.student.toString(), entry])
  );

  const rows = await Promise.all(
    students.map(async (student) => {
      const existing = entryByStudent.get(student._id.toString());
      if (existing) {
        return {
          student: student.toObject(),
          status: existing.status,
          totalAnswered: existing.totalAnswered,
          correctCount: existing.correctCount,
          score: existing.score,
          maxScore: existing.maxScore,
          percentage: existing.percentage,
          scale4: percentageToScale4(existing.percentage),
          submittedAt: existing.submittedAt || null,
          releasedAt: existing.releasedAt || null,
          academicYear: existing.academicYear || assignment.academicYear || null,
          semester: existing.semester || assignment.semester || null,
        };
      }

      const answeredCount = await PracticeAttempt.countDocuments({
        school: req.schoolId,
        student: student._id,
        assignment: assignment._id,
        status: "answered",
        sessionType: "assessment",
      });
      return {
        student: student.toObject(),
        status: answeredCount > 0 ? "in_progress" : "not_started",
        totalAnswered: answeredCount,
        correctCount: null,
        score: null,
        maxScore: null,
        percentage: null,
        scale4: null,
        submittedAt: null,
        releasedAt: null,
        academicYear: assignment.academicYear || null,
        semester: assignment.semester || null,
      };
    })
  );

  const statusSummary = rows.reduce(
    (acc, row) => {
      if (row.status === "released") acc.released += 1;
      else if (row.status === "submitted") acc.submitted += 1;
      else if (row.status === "in_progress") acc.inProgress += 1;
      else acc.notStarted += 1;
      return acc;
    },
    { released: 0, submitted: 0, inProgress: 0, notStarted: 0 }
  );

  const gradedRows = rows.filter((row) => Number.isFinite(row.percentage));
  const averagePercentage = gradedRows.length > 0
    ? Number(
        (
          gradedRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) /
          gradedRows.length
        ).toFixed(2)
      )
    : 0;
  const averageScale4 = gradedRows.length > 0
    ? Number((averagePercentage / 25).toFixed(2))
    : 0;

  res.json({
    success: true,
    data: {
      assignment: {
        _id: assignment._id,
        title: assignment.title || null,
        standard: assignment.standard,
        class: assignment.class,
        subject: assignment.subject,
        academicYear: assignment.academicYear || assignment.class?.academicYear || null,
        semester: assignment.semester || null,
      },
      rows,
      summary: {
        totalStudents: rows.length,
        ...statusSummary,
        averagePercentage,
        averageScale4,
      },
      academicYear: effectiveAcademicYear,
      semester: assignment.semester || null,
    },
  });
});

/**
 * @desc    Release submitted assessment results to students
 * @route   POST /api/practice/assessment/:assignmentId/release
 * @access  Private (Admin, Teacher)
 */
export const releaseAssessmentResults = asyncHandler(async (req, res) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const assignment = await StandardAssignment.findById(req.params.assignmentId)
    .populate("class", "academicYear");

  if (!assignment) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment not found for academic year ${effectiveAcademicYear}`,
    });
  }
  const practiceConfig = getAssignmentPracticeConfig(assignment);
  if (practiceConfig.sessionType !== "assessment") {
    return res.status(400).json({
      success: false,
      message: "This assignment is not an assessment",
    });
  }

  const now = new Date();
  const result = await StandardsGradebookEntry.updateMany(
    {
      school: req.schoolId,
      assignment: assignment._id,
      status: { $in: ["submitted", "released"] },
    },
    {
      $set: { status: "released", releasedAt: now },
    }
  );

  if (assignment.assessmentConfig?.resultsVisibility !== "immediate") {
    assignment.assessmentConfig.resultsReleaseAt = now;
    await assignment.save();
  }

  res.json({
    success: true,
    message: "Assessment results released",
    data: {
      updatedCount: result.modifiedCount || 0,
      assignmentId: assignment._id,
      releasedAt: now,
    },
  });
});

/**
 * @desc    Log a practice integrity event (tab change, blur, focus)
 * @route   POST /api/practice/integrity-event
 * @access  Private (Student)
 */
export const logIntegrityEvent = asyncHandler(async (req, res) => {
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
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
    parsed.data.assignmentId
  )
    .populate("standard")
    .populate("class", "academicYear");

  if (!assignment || !assignment.isActive) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment not found for academic year ${effectiveAcademicYear}`,
    });
  }

  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  const assignmentClassId = assignment.class?._id || assignment.class;
  const isAssigned =
    assignmentStudents.length === 0
      ? student.currentClass?.toString() === assignmentClassId?.toString()
      : assignmentStudents.some((s) => s.toString() === student._id.toString());

  if (!isAssigned) {
    return res.status(403).json({
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
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const assignment = await StandardAssignment.findById(req.params.assignmentId)
    .populate("class", "name grade section academicYear")
    .populate("standard", "code name");

  if (!assignment) {
    return res
      .status(404)
      .json({ success: false, message: "Assignment not found" });
  }
  if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
    return res.status(404).json({
      success: false,
      message: `Assignment not found for academic year ${effectiveAcademicYear}`,
    });
  }

  let students;
  const assignmentStudents = Array.isArray(assignment.students)
    ? assignment.students
    : [];
  if (assignmentStudents.length > 0) {
    students = await Student.find({
      _id: { $in: assignmentStudents },
      status: "active",
      academicYear: effectiveAcademicYear,
    }).select("firstName lastName studentId");
  } else {
    students = await Student.find({
      currentClass: assignment.class._id,
      status: "active",
      academicYear: effectiveAcademicYear,
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
      academicYear: effectiveAcademicYear,
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
  const { effectiveAcademicYear, classIds: yearClassIds } =
    await getYearScopedClassIds(req);

  const student = await Student.findById(studentId).select(
    "firstName lastName studentId currentClass"
  );
  if (!student) {
    return res
      .status(404)
      .json({ success: false, message: "Student not found" });
  }

  const eventTypes = [
    "tab_hidden",
    "window_blur",
    "visibility_visible",
    "window_focus",
  ];
  let scopedAssignmentIds = [];

  if (assignmentId) {
    const assignment = await StandardAssignment.findById(assignmentId).populate(
      "class",
      "academicYear"
    );
    if (!assignment) {
      return res
        .status(404)
        .json({ success: false, message: "Assignment not found" });
    }
    if (!isClassInAcademicYear(assignment.class, effectiveAcademicYear)) {
      return res.status(404).json({
        success: false,
        message: `Assignment not found for academic year ${effectiveAcademicYear}`,
      });
    }
    scopedAssignmentIds = [assignment._id];
  } else {
    scopedAssignmentIds = await getYearScopedAssignmentIds({
      schoolId: req.schoolId,
      classIds: yearClassIds,
    });
  }

  if (scopedAssignmentIds.length === 0) {
    const emptyCounts = eventTypes.reduce((acc, type) => {
      acc[type] = { count: 0, lastAt: null };
      return acc;
    }, {});
    return res.json({
      success: true,
      data: {
        student,
        counts: emptyCounts,
        recentEvents: [],
        academicYear: effectiveAcademicYear,
      },
    });
  }

  const match = {
    student: student._id,
    assignment: { $in: scopedAssignmentIds },
  };

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
      academicYear: effectiveAcademicYear,
    },
  });
});
