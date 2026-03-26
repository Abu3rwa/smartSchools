import PracticeAttempt from "../models/PracticeAttempt.js";
import School from "../models/School.js";
import StandardAssignment from "../models/StandardAssignment.js";
import Student from "../models/Student.js";
import PracticeSession from "../models/PracticeSession.js";
import PracticeIntegrityEvent from "../models/PracticeIntegrityEvent.js";
import MasteryRecord from "../models/MasteryRecord.js";
import StandardsGradebookEntry from "../models/StandardsGradebookEntry.js";
import StandardQuestionPool from "../models/StandardQuestionPool.js";
import standardsPracticeAIService from "../services/standardsPracticeAIService.js";
import { scheduleFromAttempt } from "../services/reviewSchedulerService.js";
import { upsertInterventionCase } from "../services/interventionQueueService.js";
import notificationService from "../services/notificationService.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { logAIUsage } from "../utils/aiUsageTracker.js";
import logger from "../utils/logger.js";
import { percentageToScaleLevel, isValidManualScore, computeEffectiveScore, SCALE_LEVELS } from "../utils/sbrScaleUtils.js";
import {
  getClassIdsForAcademicYear,
  isClassInAcademicYear,
  resolveAcademicYearForRequest,
} from "../helpers/academicYearScope.js";
import {
  getTeacherAssignments,
  getTeacherClassIds,
  isTeacherAuthorizedForClassSubject,
  resolveTeacherProfile,
} from "../helpers/teacherScoping.js";
import { resolveRequestedLanguages } from "../utils/aiLanguageUtils.js";
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
  passMarks: 50,
  resultsVisibility: "immediate",
  resultsReleaseAt: null,
};
const MC_LABELS = ["A", "B", "C", "D"];

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
  if (req?.query?.period === "full_year" || req?.body?.period === "full_year") return null;
  const fromQuery = normalizeSemester(req?.query?.semester);
  if (fromQuery) return fromQuery;
  const fromBody = normalizeSemester(req?.body?.semester);
  if (fromBody) return fromBody;
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
  const sanitizeAllowedValues = (values, allowed) => {
    if (!Array.isArray(values)) return [];
    const unique = [...new Set(values.map((value) => String(value || "")))];
    return unique.filter((value) => allowed.includes(value));
  };

  const allowedQuestionTypes = sanitizeAllowedValues(
    cfg.allowedQuestionTypes,
    QUESTION_TYPES
  );
  const allowedDifficulties = sanitizeAllowedValues(
    cfg.allowedDifficulties,
    DIFFICULTIES
  );

  return {
    sessionType: cfg.sessionType || DEFAULT_PRACTICE_CONFIG.sessionType,
    questionLimit: cfg.questionLimit ?? DEFAULT_PRACTICE_CONFIG.questionLimit,
    timeLimitSeconds:
      cfg.timeLimitSeconds ?? DEFAULT_PRACTICE_CONFIG.timeLimitSeconds,
    allowedQuestionTypes:
      allowedQuestionTypes.length > 0
        ? allowedQuestionTypes
        : DEFAULT_PRACTICE_CONFIG.allowedQuestionTypes,
    allowedDifficulties:
      allowedDifficulties.length > 0
        ? allowedDifficulties
        : DEFAULT_PRACTICE_CONFIG.allowedDifficulties,
    availability: {
      startAt: cfg.availability?.startAt || null,
      endAt: cfg.availability?.endAt || null,
    },
    lockStudentOptions:
      cfg.lockStudentOptions ?? DEFAULT_PRACTICE_CONFIG.lockStudentOptions,
  };
};

const getAssignmentScopedMasteryMinQuestions = (assignment) => {
  const questionLimit = Number(getAssignmentPracticeConfig(assignment)?.questionLimit);
  if (Number.isFinite(questionLimit) && questionLimit > 0) {
    return Math.max(1, Math.trunc(questionLimit));
  }

  const standardMinQuestions = Number(assignment?.standard?.masteryMinQuestions);
  if (Number.isFinite(standardMinQuestions) && standardMinQuestions > 0) {
    return Math.max(1, Math.trunc(standardMinQuestions));
  }

  return 5;
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

const normalizeTrueFalseAnswer = (value) => {
  const raw = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!raw) return null;
  if (
    raw === "true" ||
    raw === "t" ||
    raw === "yes" ||
    raw === "y" ||
    raw === "1"
  ) {
    return "True";
  }
  if (
    raw === "false" ||
    raw === "f" ||
    raw === "no" ||
    raw === "n" ||
    raw === "0"
  ) {
    return "False";
  }
  return null;
};

const resolveDisplayAnswer = (correctAnswer, questionOptions = []) => {
  const directTrueFalse = normalizeTrueFalseAnswer(correctAnswer);
  if (directTrueFalse) return directTrueFalse;

  const normalized = (correctAnswer || "").trim().toUpperCase();
  const option =
    Array.isArray(questionOptions) &&
    questionOptions.find(
      (item) => (item?.label || "").trim().toUpperCase() === normalized
    );

  if (option?.text) {
    const optionTextTrueFalse = normalizeTrueFalseAnswer(option.text);
    if (optionTextTrueFalse) return optionTextTrueFalse;
    const normalizedLabel = String(option.label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const normalizedText = String(option.text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (normalizedLabel && normalizedLabel === normalizedText) {
      return option.text;
    }
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

const LEGACY_OPTION_SUFFIX_PATTERN =
  /\s*\((?:choice|option)\s*[a-z]?\s*\d+\)\s*$/i;

const stripLegacyOptionSuffix = (text = "") =>
  String(text || "").replace(LEGACY_OPTION_SUFFIX_PATTERN, "").trim();

const normalizeOptionCollisionKey = (text = "") =>
  stripLegacyOptionSuffix(text)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const hasDuplicateMultipleChoiceOptions = (question) => {
  if (question?.questionType !== "multiple_choice") return false;
  const options = Array.isArray(question?.options) ? question.options : [];
  if (options.length < 2) return false;

  const seen = new Set();
  for (const option of options) {
    const key = normalizeOptionCollisionKey(option?.text || "");
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};

const sanitizeServedMultipleChoiceQuestion = (
  question,
  { seed = "practice-mcq" } = {},
) => {
  if (!question || question.questionType !== "multiple_choice") {
    return question;
  }

  const options = Array.isArray(question.options) ? question.options : [];
  try {
    const normalized = standardsPracticeAIService._normalizeMultipleChoicePayload({
      options: options.map((option, index) => ({
        label: String(option?.label || MC_LABELS[index] || "")
          .trim()
          .toUpperCase(),
        text: stripLegacyOptionSuffix(option?.text || ""),
      })),
      correctAnswer: stripLegacyOptionSuffix(question.correctAnswer || ""),
      optionMaxLength: 180,
      seed,
    });
    return {
      ...question,
      options: normalized.options,
      correctAnswer: normalized.correctAnswer,
    };
  } catch (error) {
    logger.warn("practice_pool_mcq_sanitize_failed", {
      seed,
      error: error?.message || String(error),
    });
    return {
      ...question,
      options: options.map((option, index) => ({
        label: String(option?.label || MC_LABELS[index] || "")
          .trim()
          .toUpperCase(),
        text: stripLegacyOptionSuffix(option?.text || ""),
      })),
      correctAnswer: stripLegacyOptionSuffix(question.correctAnswer || ""),
    };
  }
};

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

const parseCommaList = (value = "") =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const normalizeSortOrder = (value = "desc") =>
  String(value || "desc").toLowerCase() === "asc" ? "asc" : "desc";

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
};

const toTimeOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const resolveSbRowStatus = ({
  totalAttempts,
  masteryPercentage,
  threshold,
  minQuestions,
  submittedCount,
  releasedCount,
}) => {
  if (releasedCount > 0) return "released";
  if (submittedCount > 0) return "submitted";
  if (!totalAttempts) return "not_started";

  if (totalAttempts >= minQuestions && masteryPercentage >= threshold) {
    return "mastered";
  }

  if (totalAttempts >= minQuestions && masteryPercentage < threshold) {
    return "needs_review";
  }

  return "in_progress";
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
  const pct = Number(percentageValue);
  if (!Number.isFinite(pct)) return 0;

  const clamped = Math.max(0, Math.min(100, pct));

  // Precise conversion for assessment views:
  // map 0-100% directly to 0-4 with two-decimal precision.
  return Number(((clamped / 100) * 4).toFixed(2));
};

const getPublishedQuestionPool = async ({ schoolId, assignmentId }) => {
  return StandardQuestionPool.findOne({
    school: schoolId,
    assignment: assignmentId,
    status: "published",
    isActive: true,
  })
    .select("questions generatedQuestionCount currentVersion status")
    .lean();
};

const selectPoolQuestion = ({ poolQuestions = [], attemptCount = 0 }) => {
  if (!Array.isArray(poolQuestions) || poolQuestions.length === 0) return null;
  const index = attemptCount % poolQuestions.length;
  return poolQuestions[index] || null;
};

const upsertAssessmentGradebookProgress = async ({
  schoolId,
  assignment,
  studentId,
  sessionId = null,
  status = "in_progress",
  submittedAt = null,
  releasedAt = null,
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
      tabSwitchCount: await PracticeSession.findOne(
        { school: schoolId, student: studentId, assignment: assignment._id, ...(sessionId ? { _id: sessionId } : {}) }
      ).sort({ createdAt: -1 }).select("tabSwitchCount").lean().then((s) => s?.tabSwitchCount || 0),
    },
  };
  if (submittedAt) {
    update.submittedAt = submittedAt;
  }
  if (releasedAt) {
    update.releasedAt = releasedAt;
  }

  return StandardsGradebookEntry.findOneAndUpdate(
    { school: schoolId, assignment: assignment._id, student: studentId },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

const finalizeAssessmentSessionProgress = async ({
  schoolId,
  assignment,
  studentId,
  session,
  closedAt = new Date(),
}) => {
  if (!assignment || !studentId || !session) return null;

  const assessmentConfig = getAssessmentConfig(assignment);
  const shouldReleaseNow = assessmentConfig.resultsVisibility === "immediate";
  const targetStatus = shouldReleaseNow ? "released" : "submitted";

  const existingEntry = await StandardsGradebookEntry.findOne({
    school: schoolId,
    assignment: assignment._id,
    student: studentId,
  })
    .select("status submittedAt releasedAt")
    .lean();

  const submittedAt = existingEntry?.submittedAt || closedAt;
  const releasedAt = shouldReleaseNow
    ? existingEntry?.releasedAt || submittedAt
    : null;

  return upsertAssessmentGradebookProgress({
    schoolId,
    assignment,
    studentId,
    sessionId: session._id,
    status: targetStatus,
    submittedAt: existingEntry?.submittedAt ? null : submittedAt,
    releasedAt:
      shouldReleaseNow && !existingEntry?.releasedAt ? releasedAt : null,
  });
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

const ensureTeacherCanAccessAssignment = async (req, assignment) => {
  if (req.user?.role !== "teacher") return true;
  const teacher = await resolveTeacherProfile(req);
  if (!teacher) return false;

  if (
    assignment?.teacher &&
    assignment.teacher.toString() === teacher._id.toString()
  ) {
    return true;
  }

  const classId = assignment?.class?._id || assignment?.class;
  const subjectId = assignment?.subject?._id || assignment?.subject;
  if (!classId || !subjectId) return false;

  return isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
};

const ensureTeacherCanAccessClass = async (req, classId) => {
  if (req.user?.role !== "teacher") return true;
  const teacher = await resolveTeacherProfile(req);
  if (!teacher) return false;
  const teacherClassIds = await getTeacherClassIds(teacher._id);
  const classIdSet = new Set(teacherClassIds.map((id) => id.toString()));
  return classIdSet.has(String(classId || ""));
};

const ensureTeacherCanAccessClassSubject = async (req, classId, subjectId) => {
  if (req.user?.role !== "teacher") return true;
  const teacher = await resolveTeacherProfile(req);
  if (!teacher) return false;
  return isTeacherAuthorizedForClassSubject(teacher._id, classId, subjectId);
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
  const allowedTypes =
    Array.isArray(config.allowedQuestionTypes) &&
    config.allowedQuestionTypes.length > 0
      ? config.allowedQuestionTypes
      : DEFAULT_PRACTICE_CONFIG.allowedQuestionTypes;
  const allowedDifficulties =
    Array.isArray(config.allowedDifficulties) &&
    config.allowedDifficulties.length > 0
      ? config.allowedDifficulties
      : DEFAULT_PRACTICE_CONFIG.allowedDifficulties;

  // Prefer student's chosen question type when options are not locked and type is allowed.
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

const resolvePreferredTrueFalseAnswer = (
  recentAttempts = [],
  attemptNumber = 1
) => {
  const trueFalseAttempts = recentAttempts.filter(
    (attempt) => attempt?.questionType === "true_false"
  );
  const trueCount = trueFalseAttempts.filter(
    (attempt) => normalizeTrueFalseAnswer(attempt?.correctAnswer) === "True"
  ).length;
  const falseCount = trueFalseAttempts.filter(
    (attempt) => normalizeTrueFalseAnswer(attempt?.correctAnswer) === "False"
  ).length;

  if (trueCount > falseCount) return "False";
  if (falseCount > trueCount) return "True";
  return Number(attemptNumber) % 2 === 0 ? "False" : "True";
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
      return existing;
    }

    if (
      existing.questionLimit &&
      existing.questionsAnswered >= existing.questionLimit
    ) {
      existing.status = "completed";
      existing.endedAt = now;
      await existing.save();
      return existing;
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

  const assessmentAssignments = assignments.filter(
    (assignment) =>
      getAssignmentPracticeConfig(assignment).sessionType === "assessment"
  );
  const assessmentAssignmentIds = assessmentAssignments.map(
    (assignment) => assignment._id
  );
  let assessmentEntriesByAssignment = new Map();
  if (assessmentAssignmentIds.length > 0) {
    const assessmentEntries = await StandardsGradebookEntry.find({
      school: req.schoolId,
      student: student._id,
      assignment: { $in: assessmentAssignmentIds },
    })
      .select("assignment status totalAnswered submittedAt releasedAt")
      .lean();

    assessmentEntriesByAssignment = new Map(
      assessmentEntries.map((entry) => [entry.assignment.toString(), entry])
    );
  }

  // Calculate mastery for each assignment
  const assignmentsWithProgress = await Promise.all(
    assignments.map(async (a) => {
      const practiceConfig = getAssignmentPracticeConfig(a);
      const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        a.standard._id,
        a.standard.masteryThreshold,
        getAssignmentScopedMasteryMinQuestions(a),
        3,
        req.schoolId,
        [a._id]
      );

      const assessmentEntry = assessmentEntriesByAssignment.get(
        a._id.toString()
      );
      const isAssessment = practiceConfig.sessionType === "assessment";
      const assessmentIsComplete =
        isAssessment &&
        ["submitted", "released"].includes(assessmentEntry?.status);

      return {
        ...a.toObject(),
        mastery,
        progressStatus: assessmentIsComplete
          ? "mastered"
          : resolveProgressStatus(mastery),
        assessmentProgress: isAssessment
          ? {
              status: assessmentEntry?.status || "not_started",
              totalAnswered: assessmentEntry?.totalAnswered || 0,
              submittedAt: assessmentEntry?.submittedAt || null,
              releasedAt: assessmentEntry?.releasedAt || null,
              isComplete: assessmentIsComplete,
            }
          : null,
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

  const isFormalAssessment = practiceConfig.sessionType === "assessment";
  const requiresPublishedPool = isFormalAssessment;
  const publishedQuestionPool = await getPublishedQuestionPool({
    schoolId: req.schoolId,
    assignmentId: assignment._id,
  });

  if (
    requiresPublishedPool &&
    (!publishedQuestionPool ||
      !Array.isArray(publishedQuestionPool.questions) ||
      publishedQuestionPool.questions.length === 0)
  ) {
    return res.status(403).json({
      success: false,
      message:
        "This assessment is not released yet. Your teacher must publish the reviewed question pool.",
    });
  }

  if (isFormalAssessment) {
    const assessmentEntry = await StandardsGradebookEntry.findOne({
      school: req.schoolId,
      assignment: assignment._id,
      student: student._id,
    })
      .select("status score maxScore percentage")
      .lean();

    if (["submitted", "released"].includes(assessmentEntry?.status)) {
      const payload = generateQuestionResponseSchema.parse({
        status: "session_complete",
        message:
          "Assessment already completed and submitted. You cannot continue this assessment.",
        studentFirstName: student.firstName || null,
        assignmentInstructions: assignment.instructions || null,
        question: null,
        session: null,
      });
      return res.json({ success: true, data: payload });
    }
  }

  // Check if already mastered (use persisted + rolling logic)
  const mastery = await PracticeAttempt.calculateMastery(
    student._id,
    assignment.standard._id,
    assignment.standard.masteryThreshold,
    getAssignmentScopedMasteryMinQuestions(assignment),
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
      assignmentInstructions: assignment.instructions || null,
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

  const timeRemainingSeconds = calculateTimeRemaining(session);
  let sessionClosedReason = null;

  if (session.status === "active") {
    const now = new Date();
    if (session.timeLimitSeconds && timeRemainingSeconds === 0) {
      session.status = "expired";
      session.endedAt = now;
      sessionClosedReason = "expired";
      await session.save();
    } else if (
      session.questionLimit &&
      session.questionsAnswered >= session.questionLimit
    ) {
      session.status = "completed";
      session.endedAt = now;
      sessionClosedReason = "question_limit";
      await session.save();
    }
  }

  if (session.status !== "active") {
    if (practiceConfig.sessionType === "assessment") {
      await finalizeAssessmentSessionProgress({
        schoolId: req.schoolId,
        assignment,
        studentId: student._id,
        session,
      });
    }

    const statusMessage =
      practiceConfig.sessionType === "assessment"
        ? session.status === "expired" || sessionClosedReason === "expired"
          ? "Assessment time ended. Your assessment has been closed and submitted."
          : "Assessment complete. You reached the question limit and the assessment has been closed."
        : session.status === "expired" || sessionClosedReason === "expired"
          ? "This practice session has expired."
          : "You reached the question limit for this session.";

    const payload = generateQuestionResponseSchema.parse({
      status: "session_complete",
      message: statusMessage,
      studentFirstName: student.firstName || null,
      assignmentInstructions: assignment.instructions || null,
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
    .select(
      "questionText questionType difficulty isCorrect status feedbackParts correctAnswer"
    )
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
      .select("questionType difficulty isCorrect status correctAnswer")
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
  const generationLanguages = resolveRequestedLanguages({
    requestedLanguages: assignment?.questionWorkflow?.aiLanguages,
    subjectName,
    max: 2,
  });
  let question = null;

  if (publishedQuestionPool?.questions?.length > 0) {
    const poolQuestion = selectPoolQuestion({
      poolQuestions: publishedQuestionPool.questions,
      attemptCount,
    });
    if (!poolQuestion) {
      return res.status(503).json({
        success: false,
        message: "Published question pool is empty. Please contact your teacher.",
      });
    }
    question = {
      instruction: poolQuestion.instruction || "",
      questionText: poolQuestion.questionText,
      questionType: poolQuestion.questionType,
      options: poolQuestion.options || [],
      correctAnswer: poolQuestion.correctAnswer,
      explanation: poolQuestion.explanation || "",
      difficulty: poolQuestion.difficulty || effectiveDifficulty,
      skill: poolQuestion.skill || "",
      subskill: poolQuestion.subskill || "",
      tokenUsage: null,
    };
    question = sanitizeServedMultipleChoiceQuestion(question, {
      seed: `${assignment._id}|${attemptCount + 1}|pool`,
    });
  } else {
    const preferredTrueFalseAnswer =
      effectiveQuestionType === "true_false"
        ? resolvePreferredTrueFalseAnswer(
            recentAttempts.slice(0, ACCURACY_WINDOW),
            attemptCount + 1
          )
        : null;

    // Legacy fallback path for older assignments without question workflow.
    const generationQuestions = [...previousQuestions];
    const generationFingerprints = [...previousQuestionFingerprints];
    for (let generationAttempt = 0; generationAttempt < 3; generationAttempt += 1) {
      const candidate = await standardsPracticeAIService.generateQuestion({
        standard: assignment.standard,
        subjectName,
        requestedLanguages: generationLanguages,
        difficulty: effectiveDifficulty,
        questionType: effectiveQuestionType,
        trueFalseTargetAnswer: preferredTrueFalseAnswer,
        previousQuestions: generationQuestions,
        previousQuestionFingerprints: generationFingerprints,
        recentAttempts: sessionAttempts.slice(0, 12),
        studentFirstName: student.firstName || "",
        contextHints: {
          recentTopics: sessionContext.recentTopics,
          recentMistakes: sessionContext.recentMistakes,
          confidenceHint: sessionContext.confidenceHint,
        },
        attemptNumber: attemptCount + 1 + generationAttempt,
      });

      if (!hasDuplicateMultipleChoiceOptions(candidate)) {
        question = candidate;
        break;
      }

      generationQuestions.push(candidate.questionText || "");
      generationFingerprints.push(buildQuestionFingerprint(candidate.questionText || ""));
      logger.warn("practice_duplicate_mcq_options_regenerated", {
        schoolId: req.schoolId,
        assignmentId: assignment._id,
        studentId: student._id,
        generationAttempt: generationAttempt + 1,
      });
    }

    if (!question) {
      return res.status(503).json({
        success: false,
        message: "Could not generate a clear multiple-choice question. Please try again.",
      });
    }

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
          trueFalseTargetAnswer: preferredTrueFalseAnswer,
          generationLanguages,
        },
        response: {
          inputtokenCount: question.tokenUsage.input,
          outputtokenCount: question.tokenUsage.output,
          totalTokenCount: question.tokenUsage.total,
        },
      });
    }
  }

  question = sanitizeServedMultipleChoiceQuestion(question, {
    seed: `${assignment._id}|${attemptCount + 1}|runtime`,
  });

  // Pedagogical validation gate: ensure instruction, skill, subskill are present
  const preGateInstruction = question.instruction;
  question = standardsPracticeAIService.ensureInstructionalCompleteness(question, {
    standard: assignment.standard,
    questionType: question.questionType,
  });
  if (!preGateInstruction || !preGateInstruction.trim()) {
    logger.warn("question_instruction_synthesized", {
      schoolId: req.schoolId,
      assignmentId: assignment._id?.toString(),
      studentId: student._id?.toString(),
      questionType: question.questionType,
      difficulty: question.difficulty,
    });
  }

  // Save the attempt (pending answer)
  const attempt = await PracticeAttempt.create({
    school: req.schoolId,
    student: student._id,
    standard: assignment.standard._id,
    assignment: assignment._id,
    instruction: question.instruction || null,
    questionText: question.questionText,
    questionType: question.questionType,
    options: question.options,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    difficulty: question.difficulty,
    skill: question.skill || null,
    subskill: question.subskill || null,
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
    assignmentInstructions: assignment.instructions || null,
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
      instruction: attempt.instruction || null,
      questionText: attempt.questionText,
      questionType: attempt.questionType,
      options: attempt.options,
      difficulty: attempt.difficulty,
      skill: attempt.skill || null,
      subskill: attempt.subskill || null,
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
      select: "subject class questionWorkflow practiceConfig",
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

  if (attempt.questionType === "true_false") {
    const resolvedCorrectAnswer =
      standardsPracticeAIService.resolveTrueFalseCorrectAnswer(
        attempt.questionText,
        attempt.correctAnswer
      );
    if (
      resolvedCorrectAnswer &&
      resolvedCorrectAnswer !== attempt.correctAnswer
    ) {
      attempt.correctAnswer = resolvedCorrectAnswer;
    }
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
    requestedLanguages: resolveRequestedLanguages({
      requestedLanguages: attempt.assignment?.questionWorkflow?.aiLanguages,
      subjectName: attempt.assignment?.subject?.name || "",
      max: 2,
    }),
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
    getAssignmentScopedMasteryMinQuestions(attempt.assignment),
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
      if (session && session.status !== "active") {
        await finalizeAssessmentSessionProgress({
          schoolId: req.schoolId,
          assignment: assessmentAssignment,
          studentId: student._id,
          session,
          closedAt: session.endedAt || new Date(),
        });
      } else {
        await upsertAssessmentGradebookProgress({
          schoolId: req.schoolId,
          assignment: assessmentAssignment,
          studentId: student._id,
          sessionId: attempt.session || session?._id || null,
          status: "in_progress",
        });
      }
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
  if (req.user?.role === "teacher") {
    const teacherCanAccess = await ensureTeacherCanAccessClass(
      req,
      student.currentClass
    );
    if (!teacherCanAccess) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
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
        getAssignmentScopedMasteryMinQuestions(a),
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
  const teacherCanAccessAssignment = await ensureTeacherCanAccessAssignment(
    req,
    assignment
  );
  if (!teacherCanAccessAssignment) {
    return res.status(403).json({ success: false, message: "Not authorized" });
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

  const practiceConfig = getAssignmentPracticeConfig(assignment);
  const isAssessmentAssignment = practiceConfig.sessionType === "assessment";
  let assessmentEntryByStudent = new Map();
  if (isAssessmentAssignment && students.length > 0) {
    const assessmentEntries = await StandardsGradebookEntry.find({
      school: req.schoolId,
      assignment: assignment._id,
      student: { $in: students.map((student) => student._id) },
    })
      .select(
        "student status totalAnswered correctCount percentage score maxScore submittedAt releasedAt"
      )
      .lean();

    assessmentEntryByStudent = new Map(
      assessmentEntries.map((entry) => [entry.student.toString(), entry])
    );
  }

  const studentsProgress = await Promise.all(
    students.map(async (student) => {
      const mastery = await PracticeAttempt.calculateMastery(
        student._id,
        assignment.standard._id,
        assignment.standard.masteryThreshold,
        getAssignmentScopedMasteryMinQuestions(assignment),
        3,
        req.schoolId,
        [assignment._id]
      );
      const totalAttempts = await PracticeAttempt.countDocuments({
        student: student._id,
        assignment: assignment._id,
        status: "answered",
      });

      let effectiveMastery = mastery;
      let effectiveTotalAttempts = totalAttempts;
      let progressStatus = resolveProgressStatus(mastery);
      let assessmentProgress = null;

      if (isAssessmentAssignment) {
        const assessmentEntry = assessmentEntryByStudent.get(
          student._id.toString()
        );

        if (assessmentEntry) {
          const answered = Number(assessmentEntry.totalAnswered || 0);
          const correct = Number(assessmentEntry.correctCount || 0);
          const percentage = Number.isFinite(assessmentEntry.percentage)
            ? Number(assessmentEntry.percentage)
            : answered > 0
              ? Number(((correct / answered) * 100).toFixed(2))
              : 0;
          const isComplete = ["submitted", "released"].includes(
            assessmentEntry.status
          );

          effectiveMastery = {
            ...mastery,
            totalAttempts: answered,
            correctCount: correct,
            percentage,
            isMastered: isComplete || mastery?.isMastered,
            needsReview: false,
            masteryStatus: isComplete
              ? "mastered"
              : answered > 0
                ? "in_progress"
                : "not_started",
          };
          effectiveTotalAttempts = answered;
          progressStatus = isComplete
            ? "mastered"
            : answered > 0
              ? "in_progress"
              : "not_started";

          assessmentProgress = {
            status: assessmentEntry.status || "not_started",
            totalAnswered: answered,
            correctCount: correct,
            percentage,
            score: Number.isFinite(assessmentEntry.score)
              ? assessmentEntry.score
              : null,
            maxScore: Number.isFinite(assessmentEntry.maxScore)
              ? assessmentEntry.maxScore
              : null,
            submittedAt: assessmentEntry.submittedAt || null,
            releasedAt: assessmentEntry.releasedAt || null,
            isComplete,
          };
        } else {
          const fallbackAnswered = Number(effectiveTotalAttempts || 0);
          const fallbackCorrect = Number(mastery?.correctCount || 0);
          const fallbackPercentage =
            fallbackAnswered > 0
              ? Number(((fallbackCorrect / fallbackAnswered) * 100).toFixed(2))
              : 0;

          progressStatus =
            fallbackAnswered > 0 ? "in_progress" : "not_started";
          effectiveMastery = {
            ...mastery,
            totalAttempts: fallbackAnswered,
            correctCount: fallbackCorrect,
            percentage: fallbackPercentage,
            masteryStatus: progressStatus,
          };
        }
      }

      return {
        student: student.toObject(),
        mastery: effectiveMastery,
        progressStatus,
        totalAttempts: effectiveTotalAttempts,
        assessmentProgress,
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

  const assessmentConfig = getAssessmentConfig(assignment);
  const submittedAt = new Date();
  const releaseNow = assessmentConfig.resultsVisibility === "immediate";
  const entry = await upsertAssessmentGradebookProgress({
    schoolId: req.schoolId,
    assignment,
    studentId: student._id,
    sessionId: session._id,
    status: releaseNow ? "released" : "submitted",
    submittedAt,
    releasedAt: releaseNow ? submittedAt : null,
  });

  const now = new Date();
  const hasReleaseDate = Boolean(assessmentConfig.resultsReleaseAt);
  const isReleaseDateReached =
    hasReleaseDate &&
    now.getTime() >= new Date(assessmentConfig.resultsReleaseAt).getTime();
  const canViewResult =
    assessmentConfig.resultsVisibility === "immediate" || isReleaseDateReached;

  // Notify parents of completion (fire-and-forget)
  if (assignment.notifyParents !== false) {
    notificationService.sendStandardAssignmentCompletedNotification({
      studentId: student._id,
      assignment,
      score: entry.score ?? null,
      maxScore: entry.maxScore ?? null,
    }).catch(err => logger.error("finalize_assessment_notif_failed", { error: err?.message }));
  }

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
  const averageScale4 = gradedItems.length > 0
    ? percentageToScale4(averagePercentage)
    : 0;

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
        totalScale4: 0,
      });
    }
    const aggregate = standardAccumulator.get(standardId);
    aggregate.totalAssessments += 1;
    aggregate.totalPercentage += Number(item.percentage || 0);
    aggregate.totalScale4 += Number.isFinite(item.scale4)
      ? Number(item.scale4)
      : percentageToScale4(Number(item.percentage || 0));
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
      averageScale4:
        item.totalAssessments > 0
          ? Number((item.totalScale4 / item.totalAssessments).toFixed(2))
          : 0,
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
  const teacherCanAccessAssignment = await ensureTeacherCanAccessAssignment(
    req,
    assignment
  );
  if (!teacherCanAccessAssignment) {
    return res.status(403).json({ success: false, message: "Not authorized" });
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
      "student status totalAnswered correctCount score maxScore percentage submittedAt releasedAt academicYear semester metadata"
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
          tabSwitchCount: existing.metadata?.tabSwitchCount || 0,
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
        tabSwitchCount: 0,
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
    ? percentageToScale4(averagePercentage)
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
        assessmentConfig: getAssessmentConfig(assignment),
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
 * @desc    Get averaged standards gradebook across repeated formal assessments
 * @route   GET /api/practice/assessment/standard-average
 * @access  Private (Admin, Teacher)
 */
export const getStandardAverageGradebook = asyncHandler(async (req, res) => {
  const { classId, subjectId, standardId } = req.query || {};
  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const effectiveSemester = resolveSemesterForRequest(req);

  if (!classId || !subjectId || !standardId) {
    return res.status(400).json({
      success: false,
      message: "classId, subjectId and standardId are required",
    });
  }
  const teacherCanAccessClassSubject = await ensureTeacherCanAccessClassSubject(
    req,
    classId,
    subjectId
  );
  if (!teacherCanAccessClassSubject) {
    return res.status(403).json({ success: false, message: "Not authorized" });
  }

  const assignments = await StandardAssignment.find({
    school: req.schoolId,
    isActive: true,
    class: classId,
    subject: subjectId,
    standard: standardId,
    "practiceConfig.sessionType": "assessment",
    $or: [{ semester: effectiveSemester }, { semester: null }, { semester: { $exists: false } }],
  })
    .select("_id title class subject standard academicYear semester")
    .lean();

  const assignmentIds = assignments.map((item) => item._id);
  const students = await Student.find({
    currentClass: classId,
    status: "active",
    academicYear: effectiveAcademicYear,
  })
    .select("firstName lastName studentId")
    .lean();

  const entries = assignmentIds.length > 0
    ? await StandardsGradebookEntry.find({
        school: req.schoolId,
        assignment: { $in: assignmentIds },
        class: classId,
        subject: subjectId,
        standard: standardId,
      })
        .select("student assignment percentage score maxScore status submittedAt releasedAt")
        .lean()
    : [];

  const entriesByStudent = new Map();
  entries.forEach((entry) => {
    const key = entry.student.toString();
    if (!entriesByStudent.has(key)) {
      entriesByStudent.set(key, []);
    }
    entriesByStudent.get(key).push(entry);
  });

  const rows = students.map((student) => {
    const list = entriesByStudent.get(student._id.toString()) || [];
    const percentages = list
      .map((entry) => Number(entry.percentage))
      .filter((value) => Number.isFinite(value));
    const averagePercentage = percentages.length > 0
      ? Number((percentages.reduce((sum, value) => sum + value, 0) / percentages.length).toFixed(2))
      : null;

    return {
      student,
      attemptCount: list.length,
      gradedAttemptCount: percentages.length,
      averagePercentage,
      averageScale4: Number.isFinite(averagePercentage) ? percentageToScale4(averagePercentage) : null,
      attempts: list
        .map((entry) => ({
          assignmentId: entry.assignment,
          percentage: entry.percentage,
          score: entry.score,
          maxScore: entry.maxScore,
          status: entry.status,
          submittedAt: entry.submittedAt || null,
          releasedAt: entry.releasedAt || null,
        }))
        .sort((left, right) => {
          const leftTime = left.submittedAt ? new Date(left.submittedAt).getTime() : 0;
          const rightTime = right.submittedAt ? new Date(right.submittedAt).getTime() : 0;
          return rightTime - leftTime;
        }),
    };
  });

  const gradedRows = rows.filter((row) => Number.isFinite(row.averagePercentage));
  const classAveragePercentage = gradedRows.length > 0
    ? Number(
        (
          gradedRows.reduce((sum, row) => sum + Number(row.averagePercentage || 0), 0) /
          gradedRows.length
        ).toFixed(2)
      )
    : 0;

  res.json({
    success: true,
    data: {
      rows,
      assignmentCount: assignments.length,
      assignments,
      summary: {
        totalStudents: rows.length,
        gradedStudents: gradedRows.length,
        classAveragePercentage,
        classAverageScale4: percentageToScale4(classAveragePercentage),
      },
      filters: {
        classId,
        subjectId,
        standardId,
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    },
  });
});

/**
 * @desc    Dedicated Standards-Based gradebook view with filters and pagination
 * @route   GET /api/practice/sb-gradebook
 * @access  Private (Admin, Teacher, Department Principal)
 */
export const getSBGradebook = asyncHandler(async (req, res) => {
  const {
    classId,
    studentId,
    subjectId,
    standardId,
    sessionType,
    fromDate,
    toDate,
    search,
    sortBy = "lastActivityAt",
    sortOrder = "desc",
    status,
  } = req.query || {};

  const page = parsePositiveInt(req.query?.page, 1);
  const limit = Math.min(parsePositiveInt(req.query?.limit, 25), 200);
  const normalizedSortOrder = normalizeSortOrder(sortOrder);
  const statusFilter = new Set(parseCommaList(status));
  const searchTerm = String(search || "").trim().toLowerCase();
  const fromTime = toTimeOrNull(fromDate);
  const toTime = toTimeOrNull(toDate);

  // Read scoringMode for this school
  const schoolDoc = await School.findById(req.schoolId).select('settings.standardsGradebook').lean();
  const scoringMode = schoolDoc?.settings?.standardsGradebook?.scoringMode || 'average';

  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const effectiveSemester = resolveSemesterForRequest(req);

  const { classIds: yearClassIds } = await getYearScopedClassIds(
    req,
    classId ? [classId] : null
  );

  let allowedClassIds = yearClassIds;
  if (req.user?.role === "teacher") {
    const teacher = await resolveTeacherProfile(req);
    if (!teacher) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    const teacherClassIds = await getTeacherClassIds(teacher._id);
    const teacherClassSet = new Set(teacherClassIds.map((id) => id.toString()));
    allowedClassIds = yearClassIds.filter((id) => teacherClassSet.has(String(id)));
  }

  if (!allowedClassIds.length) {
    return res.json({
      success: true,
      data: {
        rows: [],
        summary: {
          totalRows: 0,
          totalStudents: 0,
          mastered: 0,
          inProgress: 0,
          notStarted: 0,
          needsReview: 0,
          submitted: 0,
          released: 0,
          averageMastery: 0,
          averagePercentage: 0,
        },
        pagination: { page, limit, total: 0, pages: 0 },
        filterOptions: { classes: [], subjects: [], standards: [], students: [], statuses: [] },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const assignmentQuery = {
    school: req.schoolId,
    isActive: true,
    class: { $in: allowedClassIds },
    $or: [
      { semester: effectiveSemester },
      { semester: null },
      { semester: { $exists: false } },
    ],
  };

  if (subjectId) assignmentQuery.subject = subjectId;
  if (standardId) assignmentQuery.standard = standardId;
  if (sessionType) assignmentQuery["practiceConfig.sessionType"] = sessionType;

  const assignments = await StandardAssignment.find(assignmentQuery)
    .select("_id title class subject standard assignedDate dueDate practiceConfig students")
    .populate("class", "name grade section")
    .populate("subject", "name code")
    .populate("standard", "code name masteryThreshold masteryMinQuestions")
    .lean();

  if (!assignments.length) {
    return res.json({
      success: true,
      data: {
        rows: [],
        summary: {
          totalRows: 0,
          totalStudents: 0,
          mastered: 0,
          inProgress: 0,
          notStarted: 0,
          needsReview: 0,
          submitted: 0,
          released: 0,
          averageMastery: 0,
          averagePercentage: 0,
        },
        pagination: { page, limit, total: 0, pages: 0 },
        filterOptions: { classes: [], subjects: [], standards: [], students: [], statuses: [] },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const assignmentIds = assignments.map((assignment) => assignment._id);
  const assignmentMap = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));

  const classIdSet = new Set(assignments.map((assignment) => String(assignment.class?._id || assignment.class)).filter(Boolean));
  const generalClassIdSet = new Set();
  const targetedStudentIdSet = new Set();

  assignments.forEach((assignment) => {
    const assignmentStudentIds = Array.isArray(assignment.students)
      ? assignment.students.map((value) => String(value)).filter(Boolean)
      : [];

    if (assignmentStudentIds.length > 0) {
      assignmentStudentIds.forEach((id) => targetedStudentIdSet.add(id));
      return;
    }

    const assignmentClassId = String(assignment.class?._id || assignment.class || "");
    if (assignmentClassId) generalClassIdSet.add(assignmentClassId);
  });

  const studentQuery = {
    school: req.schoolId,
    status: "active",
    academicYear: effectiveAcademicYear,
  };

  const studentOrFilters = [];
  if (generalClassIdSet.size > 0) {
    studentOrFilters.push({ currentClass: { $in: Array.from(generalClassIdSet) } });
  }
  if (targetedStudentIdSet.size > 0) {
    studentOrFilters.push({ _id: { $in: Array.from(targetedStudentIdSet) } });
  }

  if (studentOrFilters.length > 0) {
    studentQuery.$or = studentOrFilters;
  } else {
    studentQuery.currentClass = { $in: Array.from(classIdSet) };
  }

  if (studentId) studentQuery._id = studentId;

  const students = await Student.find(studentQuery)
    .select("_id firstName lastName studentId currentClass")
    .lean();
  const studentMap = new Map(students.map((student) => [String(student._id), student]));

  if (!students.length) {
    return res.json({
      success: true,
      data: {
        rows: [],
        summary: {
          totalRows: 0,
          totalStudents: 0,
          mastered: 0,
          inProgress: 0,
          notStarted: 0,
          needsReview: 0,
          submitted: 0,
          released: 0,
          averageMastery: 0,
          averagePercentage: 0,
        },
        pagination: { page, limit, total: 0, pages: 0 },
        filterOptions: { classes: [], subjects: [], standards: [], students: [], statuses: [] },
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester,
      },
    });
  }

  const studentIds = students.map((student) => student._id);
  const attemptQuery = {
    school: req.schoolId,
    assignment: { $in: assignmentIds },
    student: { $in: studentIds },
    status: "answered",
  };
  if (fromTime || toTime) {
    attemptQuery.answeredAt = {};
    if (fromTime) attemptQuery.answeredAt.$gte = new Date(fromTime);
    if (toTime) attemptQuery.answeredAt.$lte = new Date(toTime);
  }

  const attempts = await PracticeAttempt.find(attemptQuery)
    .select("student assignment isCorrect answeredAt createdAt")
    .lean();

  const entryQuery = {
    school: req.schoolId,
    assignment: { $in: assignmentIds },
    student: { $in: studentIds },
  };
  if (fromTime || toTime) {
    entryQuery.updatedAt = {};
    if (fromTime) entryQuery.updatedAt.$gte = new Date(fromTime);
    if (toTime) entryQuery.updatedAt.$lte = new Date(toTime);
  }

  const gradebookEntries = await StandardsGradebookEntry.find(entryQuery)
    .select("student assignment status percentage submittedAt releasedAt updatedAt")
    .lean();

  const bucketMap = new Map();
  const assignmentBucketById = new Map();

  assignments.forEach((assignment) => {
    const classDoc = assignment.class || {};
    const subjectDoc = assignment.subject || {};
    const standardDoc = assignment.standard || {};
    const key = [
      String(classDoc._id || assignment.class || ""),
      String(subjectDoc._id || assignment.subject || ""),
      String(standardDoc._id || assignment.standard || ""),
    ].join("|");

    if (!bucketMap.has(key)) {
      bucketMap.set(key, {
        key,
        class: {
          _id: classDoc._id || assignment.class,
          name: classDoc.name || "",
          grade: classDoc.grade || null,
          section: classDoc.section || null,
        },
        subject: {
          _id: subjectDoc._id || assignment.subject,
          name: subjectDoc.name || "",
          code: subjectDoc.code || "",
        },
        standard: {
          _id: standardDoc._id || assignment.standard,
          code: standardDoc.code || "",
          name: standardDoc.name || "",
          masteryThreshold: Number(standardDoc.masteryThreshold || 80),
          masteryMinQuestions: Number(standardDoc.masteryMinQuestions || 5),
        },
        sessionType: assignment.practiceConfig?.sessionType || "practice",
        assignments: [],
      });
    }

    bucketMap.get(key).assignments.push({
      _id: assignment._id,
      title: assignment.title || null,
      assignedDate: assignment.assignedDate || null,
      dueDate: assignment.dueDate || null,
      studentIds: Array.isArray(assignment.students)
        ? assignment.students.map((value) => String(value)).filter(Boolean)
        : [],
    });
    assignmentBucketById.set(String(assignment._id), key);
  });

  const rowMap = new Map();

  const isStudentAssignedToAssignment = ({ student, assignment, classId }) => {
    const assignmentStudentIds = Array.isArray(assignment.studentIds)
      ? assignment.studentIds
      : [];

    if (assignmentStudentIds.length > 0) {
      return assignmentStudentIds.includes(String(student._id));
    }

    return String(student.currentClass || "") === String(classId || "");
  };

  const ensureRow = (student, bucket) => {
    const assignedAssignments = bucket.assignments.filter((assignment) =>
      isStudentAssignedToAssignment({
        student,
        assignment,
        classId: bucket.class._id,
      })
    );
    if (!assignedAssignments.length) return null;

    const rowKey = `${student._id}|${bucket.key}`;
    if (!rowMap.has(rowKey)) {
      rowMap.set(rowKey, {
        rowKey,
        student: {
          _id: student._id,
          firstName: student.firstName || "",
          lastName: student.lastName || "",
          studentId: student.studentId || "",
        },
        class: bucket.class,
        subject: bucket.subject,
        standard: bucket.standard,
        sessionType: bucket.sessionType,
        assignments: assignedAssignments,
        totalAssignments: assignedAssignments.length,
        totalAttempts: 0,
        correctCount: 0,
        masteryPercentage: 0,
        averagePercentage: null,
        submittedCount: 0,
        releasedCount: 0,
        lastActivityAt: null,
        status: "not_started",
      });
    }
    return rowMap.get(rowKey);
  };

  students.forEach((student) => {
    const classIdValue = String(student.currentClass || "");
    bucketMap.forEach((bucket) => {
      if (String(bucket.class._id || "") !== classIdValue) return;
      ensureRow(student, bucket);
    });
  });

  attempts.forEach((attempt) => {
    const student = studentMap.get(String(attempt.student));
    const assignment = assignmentMap.get(String(attempt.assignment));
    const bucketKey = assignmentBucketById.get(String(attempt.assignment));
    if (!student || !bucketKey || !bucketMap.has(bucketKey)) return;
    if (
      assignment &&
      !isStudentAssignedToAssignment({
        student,
        assignment: {
          studentIds: Array.isArray(assignment.students)
            ? assignment.students.map((value) => String(value)).filter(Boolean)
            : [],
        },
        classId: assignment.class?._id || assignment.class,
      })
    ) {
      return;
    }
    const row = ensureRow(student, bucketMap.get(bucketKey));
    if (!row) return;
    row.totalAttempts += 1;
    if (attempt.isCorrect) row.correctCount += 1;
    const activityTime = toTimeOrNull(attempt.answeredAt || attempt.createdAt);
    if (activityTime && (!row.lastActivityAt || activityTime > row.lastActivityAt)) {
      row.lastActivityAt = activityTime;
    }
  });

  const percentageTotalsByRow = new Map();
  gradebookEntries.forEach((entry) => {
    const student = studentMap.get(String(entry.student));
    const assignment = assignmentMap.get(String(entry.assignment));
    const bucketKey = assignmentBucketById.get(String(entry.assignment));
    if (!student || !bucketKey || !bucketMap.has(bucketKey)) return;
    if (
      assignment &&
      !isStudentAssignedToAssignment({
        student,
        assignment: {
          studentIds: Array.isArray(assignment.students)
            ? assignment.students.map((value) => String(value)).filter(Boolean)
            : [],
        },
        classId: assignment.class?._id || assignment.class,
      })
    ) {
      return;
    }
    const row = ensureRow(student, bucketMap.get(bucketKey));
    if (!row) return;

    if (entry.status === "submitted") row.submittedCount += 1;
    if (entry.status === "released") row.releasedCount += 1;

    if (Number.isFinite(Number(entry.percentage))) {
      const existing = percentageTotalsByRow.get(row.rowKey) || { total: 0, count: 0, latestTime: 0, latestPercentage: null, maxPercentage: -Infinity };
      existing.total += Number(entry.percentage);
      existing.count += 1;
      const entryTime = toTimeOrNull(entry.releasedAt || entry.submittedAt || entry.updatedAt) || 0;
      if (entryTime > (existing.latestTime || 0)) {
        existing.latestTime = entryTime;
        existing.latestPercentage = Number(entry.percentage);
      }
      if (Number(entry.percentage) > (existing.maxPercentage ?? -Infinity)) {
        existing.maxPercentage = Number(entry.percentage);
      }
      percentageTotalsByRow.set(row.rowKey, existing);
    }

    const activityTime = toTimeOrNull(entry.releasedAt || entry.submittedAt || entry.updatedAt);
    if (activityTime && (!row.lastActivityAt || activityTime > row.lastActivityAt)) {
      row.lastActivityAt = activityTime;
    }
  });

  let rows = Array.from(rowMap.values()).map((row) => {
    const masteryPercentage =
      row.totalAttempts > 0
        ? Number(((row.correctCount / row.totalAttempts) * 100).toFixed(2))
        : 0;

    const percentageStats = percentageTotalsByRow.get(row.rowKey);
    let averagePercentage = null;
    if (percentageStats && percentageStats.count > 0) {
      if (scoringMode === 'latest') {
        averagePercentage = percentageStats.latestPercentage ?? Number((percentageStats.total / percentageStats.count).toFixed(2));
      } else if (scoringMode === 'highest') {
        averagePercentage = percentageStats.maxPercentage !== -Infinity ? percentageStats.maxPercentage : Number((percentageStats.total / percentageStats.count).toFixed(2));
      } else {
        averagePercentage = Number((percentageStats.total / percentageStats.count).toFixed(2));
      }
    }

    const statusValue = resolveSbRowStatus({
      totalAttempts: row.totalAttempts,
      masteryPercentage,
      threshold: row.standard.masteryThreshold || 80,
      minQuestions: row.standard.masteryMinQuestions || 5,
      submittedCount: row.submittedCount,
      releasedCount: row.releasedCount,
    });

    return {
      ...row,
      masteryPercentage,
      averagePercentage,
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
      status: statusValue,
    };
  });

  if (statusFilter.size > 0) {
    rows = rows.filter((row) => statusFilter.has(String(row.status || "").toLowerCase()));
  }

  if (searchTerm) {
    rows = rows.filter((row) => {
      const haystack = [
        row.student.firstName,
        row.student.lastName,
        row.student.studentId,
        row.standard.code,
        row.standard.name,
        row.subject.name,
        row.class.name,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    });
  }

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalRows += 1;
      acc.totalStudentsSet.add(String(row.student._id));
      if (row.status === "mastered") acc.mastered += 1;
      else if (row.status === "in_progress") acc.inProgress += 1;
      else if (row.status === "needs_review") acc.needsReview += 1;
      else if (row.status === "submitted") acc.submitted += 1;
      else if (row.status === "released") acc.released += 1;
      else acc.notStarted += 1;

      acc.masterySum += Number(row.masteryPercentage || 0);
      if (Number.isFinite(Number(row.averagePercentage))) {
        acc.percentageSum += Number(row.averagePercentage);
        acc.percentageCount += 1;
      }
      return acc;
    },
    {
      totalRows: 0,
      totalStudentsSet: new Set(),
      mastered: 0,
      inProgress: 0,
      notStarted: 0,
      needsReview: 0,
      submitted: 0,
      released: 0,
      masterySum: 0,
      percentageSum: 0,
      percentageCount: 0,
    }
  );

  const sortReaders = {
    student: (row) => `${row.student.firstName} ${row.student.lastName}`.trim().toLowerCase(),
    class: (row) => String(row.class.name || "").toLowerCase(),
    subject: (row) => String(row.subject.name || "").toLowerCase(),
    standard: (row) => String(row.standard.code || row.standard.name || "").toLowerCase(),
    status: (row) => String(row.status || "").toLowerCase(),
    masteryPercentage: (row) => Number(row.masteryPercentage || 0),
    averagePercentage: (row) => Number(row.averagePercentage || -1),
    lastActivityAt: (row) => toTimeOrNull(row.lastActivityAt) || 0,
    totalAttempts: (row) => Number(row.totalAttempts || 0),
  };
  const sortReader = sortReaders[sortBy] || sortReaders.lastActivityAt;

  rows.sort((left, right) => {
    const a = sortReader(left);
    const b = sortReader(right);
    if (a < b) return normalizedSortOrder === "asc" ? -1 : 1;
    if (a > b) return normalizedSortOrder === "asc" ? 1 : -1;
    return 0;
  });

  const total = rows.length;
  const pages = total > 0 ? Math.ceil(total / limit) : 0;
  const pagedRows = rows.slice((page - 1) * limit, (page - 1) * limit + limit);

  const classOptionsMap = new Map();
  const subjectOptionsMap = new Map();
  const standardOptionsMap = new Map();
  const studentOptionsMap = new Map();

  rows.forEach((row) => {
    classOptionsMap.set(String(row.class._id), row.class);
    subjectOptionsMap.set(String(row.subject._id), row.subject);
    standardOptionsMap.set(String(row.standard._id), row.standard);
    studentOptionsMap.set(String(row.student._id), row.student);
  });

  res.json({
    success: true,
    data: {
      rows: pagedRows,
      scoringMode,
      summary: {
        totalRows: summary.totalRows,
        totalStudents: summary.totalStudentsSet.size,
        mastered: summary.mastered,
        inProgress: summary.inProgress,
        notStarted: summary.notStarted,
        needsReview: summary.needsReview,
        submitted: summary.submitted,
        released: summary.released,
        averageMastery:
          summary.totalRows > 0
            ? Number((summary.masterySum / summary.totalRows).toFixed(2))
            : 0,
        averagePercentage:
          summary.percentageCount > 0
            ? Number((summary.percentageSum / summary.percentageCount).toFixed(2))
            : 0,
      },
      pagination: {
        page,
        limit,
        total,
        pages,
      },
      filterOptions: {
        classes: Array.from(classOptionsMap.values()),
        subjects: Array.from(subjectOptionsMap.values()),
        standards: Array.from(standardOptionsMap.values()),
        students: Array.from(studentOptionsMap.values()),
        statuses: [
          "not_started",
          "in_progress",
          "needs_review",
          "mastered",
          "submitted",
          "released",
        ],
      },
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester,
      filters: {
        classId: classId || null,
        studentId: studentId || null,
        subjectId: subjectId || null,
        standardId: standardId || null,
        sessionType: sessionType || null,
        fromDate: fromDate || null,
        toDate: toDate || null,
        search: search || "",
        status: statusFilter.size > 0 ? Array.from(statusFilter) : [],
      },
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
  const teacherCanAccessAssignment = await ensureTeacherCanAccessAssignment(
    req,
    assignment
  );
  if (!teacherCanAccessAssignment) {
    return res.status(403).json({ success: false, message: "Not authorized" });
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
      status: "submitted",
    },
    {
      $set: { status: "released", releasedAt: now },
    }
  );

  if (assignment.assessmentConfig?.resultsVisibility !== "immediate") {
    assignment.assessmentConfig.resultsReleaseAt = now;
    await assignment.save();
  }

  const updatedCount = result.modifiedCount || 0;
  res.json({
    success: true,
    message:
      updatedCount > 0
        ? "Assessment results released"
        : "No submitted results were pending release",
    data: {
      updatedCount,
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

  // Increment tab switch count on session for tab_hidden events
  let tabSwitchCount = 0;
  if (session && parsed.data.eventType === "tab_hidden") {
    session.tabSwitchCount = (session.tabSwitchCount || 0) + 1;
    await session.save();
    tabSwitchCount = session.tabSwitchCount;
  } else if (session) {
    tabSwitchCount = session.tabSwitchCount || 0;
  }

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
    data: { eventId: event._id, tabSwitchCount },
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
  const teacherCanAccessAssignment = await ensureTeacherCanAccessAssignment(
    req,
    assignment
  );
  if (!teacherCanAccessAssignment) {
    return res.status(403).json({ success: false, message: "Not authorized" });
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
  if (req.user?.role === "teacher") {
    const teacherCanAccess = await ensureTeacherCanAccessClass(
      req,
      student.currentClass
    );
    if (!teacherCanAccess) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
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
    const teacherCanAccessAssignment = await ensureTeacherCanAccessAssignment(
      req,
      assignment
    );
    if (!teacherCanAccessAssignment) {
      return res.status(403).json({ success: false, message: "Not authorized" });
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

/* ─────────────────────────────────────────────────────────────
 *  Manual Score Entry — Single
 * ───────────────────────────────────────────────────────────── */

/**
 * @desc    Upsert a manual score (0-4, decimals allowed) for a student × standard
 * @route   PUT /api/practice/sb-gradebook/manual-score
 * @access  Private (Admin, Teacher)
 */
export const updateManualScore = asyncHandler(async (req, res) => {
  const { studentId, standardId, classId, subjectId, score, semester, academicYear } = req.body || {};

  if (!studentId || !standardId || !classId || !subjectId) {
    return res.status(400).json({ success: false, message: "studentId, standardId, classId and subjectId are required." });
  }
  if (!isValidManualScore(score)) {
    return res.status(400).json({ success: false, message: "score must be a number between 0 and 4, or null to clear." });
  }

  const effectiveAcademicYear = academicYear || resolveAcademicYearForRequest(req);
  const effectiveSemester = semester != null ? Number(semester) : resolveSemesterForRequest(req);

  if (req.user?.role === "teacher") {
    const authorized = await ensureTeacherCanAccessClassSubject(req, classId, subjectId);
    if (!authorized) {
      return res.status(403).json({ success: false, message: "Not authorized for this class/subject." });
    }
  }

  const student = await Student.findOne({ _id: studentId, school: req.schoolId }).select("_id").lean();
  if (!student) {
    return res.status(404).json({ success: false, message: "Student not found." });
  }

  const filter = {
    school: req.schoolId,
    student: studentId,
    standard: standardId,
    class: classId,
    subject: subjectId,
    academicYear: effectiveAcademicYear,
  };
  if (effectiveSemester) filter.semester = effectiveSemester;

  let entry = await StandardsGradebookEntry.findOne(filter);

  if (score === null) {
    // Clear manual score
    if (entry) {
      entry.manualScore = null;
      entry.isManualEntry = false;
      entry.manualEnteredBy = null;
      entry.manualEnteredAt = null;
      entry.effectiveScore = percentageToScale4(entry.percentage);
      await entry.save();
    }
    return res.json({ success: true, data: { entry: entry || null, cleared: true } });
  }

  if (!entry) {
    // Create a new manual-only entry (no assignment linked)
    // Find any assignment for this class/subject/standard to link to, or create without
    let assignmentId = null;
    const existingAssignment = await StandardAssignment.findOne({
      school: req.schoolId,
      class: classId,
      subject: subjectId,
      standard: standardId,
      isActive: true,
    }).select("_id").lean();
    if (existingAssignment) assignmentId = existingAssignment._id;

    if (!assignmentId) {
      // Create a placeholder assignment for manual grades
      const newAssignment = await StandardAssignment.create({
        school: req.schoolId,
        class: classId,
        subject: subjectId,
        standard: standardId,
        title: "Manual Assessment",
        createdBy: req.user?._id,
        isActive: true,
        academicYear: effectiveAcademicYear,
        semester: effectiveSemester || null,
        practiceConfig: { sessionType: "assessment" },
      });
      assignmentId = newAssignment._id;
    }

    entry = await StandardsGradebookEntry.create({
      school: req.schoolId,
      assignment: assignmentId,
      student: studentId,
      standard: standardId,
      class: classId,
      subject: subjectId,
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester || null,
      status: "released",
      manualScore: score,
      isManualEntry: true,
      manualEnteredBy: req.user?._id,
      manualEnteredAt: new Date(),
      effectiveScore: score,
    });
  } else {
    entry.manualScore = score;
    entry.isManualEntry = true;
    entry.manualEnteredBy = req.user?._id;
    entry.manualEnteredAt = new Date();
    entry.effectiveScore = score;
    await entry.save();
  }

  return res.json({ success: true, data: { entry } });
});

/* ─────────────────────────────────────────────────────────────
 *  Manual Score Entry — Bulk
 * ───────────────────────────────────────────────────────────── */

/**
 * @desc    Bulk upsert manual scores for multiple students × standards
 * @route   PUT /api/practice/sb-gradebook/manual-scores/bulk
 * @access  Private (Admin, Teacher)
 */
export const updateBulkManualScores = asyncHandler(async (req, res) => {
  const { classId, subjectId, semester, academicYear, scores } = req.body || {};

  if (!classId || !subjectId || !Array.isArray(scores) || scores.length === 0) {
    return res.status(400).json({ success: false, message: "classId, subjectId and scores[] are required." });
  }
  if (scores.length > 500) {
    return res.status(400).json({ success: false, message: "Maximum 500 scores per batch." });
  }

  for (const item of scores) {
    if (!item.studentId || !item.standardId) {
      return res.status(400).json({ success: false, message: "Each score must have studentId and standardId." });
    }
    if (!isValidManualScore(item.score)) {
      return res.status(400).json({ success: false, message: `Invalid score value: ${item.score}. Must be between 0 and 4 or null.` });
    }
  }

  if (req.user?.role === "teacher") {
    const authorized = await ensureTeacherCanAccessClassSubject(req, classId, subjectId);
    if (!authorized) {
      return res.status(403).json({ success: false, message: "Not authorized for this class/subject." });
    }
  }

  const effectiveAcademicYear = academicYear || resolveAcademicYearForRequest(req);
  const effectiveSemester = semester != null ? Number(semester) : resolveSemesterForRequest(req);

  const results = { updated: 0, created: 0, cleared: 0, errors: [] };

  for (const { studentId, standardId, score } of scores) {
    try {
      const filter = {
        school: req.schoolId,
        student: studentId,
        standard: standardId,
        class: classId,
        subject: subjectId,
        academicYear: effectiveAcademicYear,
      };
      if (effectiveSemester) filter.semester = effectiveSemester;

      let entry = await StandardsGradebookEntry.findOne(filter);

      if (score === null) {
        if (entry) {
          entry.manualScore = null;
          entry.isManualEntry = false;
          entry.manualEnteredBy = null;
          entry.manualEnteredAt = null;
          entry.effectiveScore = percentageToScale4(entry.percentage);
          await entry.save();
          results.cleared += 1;
        }
        continue;
      }

      if (!entry) {
        let assignmentId = null;
        const existing = await StandardAssignment.findOne({
          school: req.schoolId, class: classId, subject: subjectId, standard: standardId, isActive: true,
        }).select("_id").lean();

        if (existing) {
          assignmentId = existing._id;
        } else {
          const newAssignment = await StandardAssignment.create({
            school: req.schoolId, class: classId, subject: subjectId, standard: standardId,
            title: "Manual Assessment", createdBy: req.user?._id, isActive: true,
            academicYear: effectiveAcademicYear, semester: effectiveSemester || null,
            practiceConfig: { sessionType: "assessment" },
          });
          assignmentId = newAssignment._id;
        }

        await StandardsGradebookEntry.create({
          school: req.schoolId, assignment: assignmentId, student: studentId, standard: standardId,
          class: classId, subject: subjectId, academicYear: effectiveAcademicYear,
          semester: effectiveSemester || null, status: "released",
          manualScore: score, isManualEntry: true, manualEnteredBy: req.user?._id,
          manualEnteredAt: new Date(), effectiveScore: score,
        });
        results.created += 1;
      } else {
        entry.manualScore = score;
        entry.isManualEntry = true;
        entry.manualEnteredBy = req.user?._id;
        entry.manualEnteredAt = new Date();
        entry.effectiveScore = score;
        await entry.save();
        results.updated += 1;
      }
    } catch (err) {
      results.errors.push({ studentId, standardId, message: err.message });
    }
  }

  return res.json({ success: true, data: results });
});

/* ─────────────────────────────────────────────────────────────
 *  Standards-Based Gradebook — Matrix View
 * ───────────────────────────────────────────────────────────── */

/**
 * @desc    Get SB gradebook in matrix format (students × standards)
 * @route   GET /api/practice/sb-gradebook/matrix
 * @access  Private (Admin, Teacher, Department Principal)
 */
export const getSBGradebookMatrix = asyncHandler(async (req, res) => {
  const { classId, subjectId, search } = req.query || {};
  const page = parsePositiveInt(req.query?.page, 1);
  const limit = Math.min(parsePositiveInt(req.query?.limit, 50), 200);

  // Read scoringMode from school settings
  const schoolDoc = await School.findById(req.schoolId).select('settings.standardsGradebook').lean();
  const scoringMode = schoolDoc?.settings?.standardsGradebook?.scoringMode || 'average';

  const effectiveAcademicYear = resolveAcademicYearForRequest(req);
  const effectiveSemester = resolveSemesterForRequest(req);

  const { classIds: yearClassIds } = await getYearScopedClassIds(req);
  let availableClassIds = yearClassIds;
  let teacherProfile = null;
  let teacherScopedSubjectIds = null;
  if (req.user?.role === "teacher") {
    teacherProfile = await resolveTeacherProfile(req);
    if (!teacherProfile) return res.status(403).json({ success: false, message: "Not authorized" });
    const teacherClassIds = await getTeacherClassIds(teacherProfile._id);
    const teacherClassSet = new Set(teacherClassIds.map((id) => id.toString()));
    availableClassIds = yearClassIds.filter((id) => teacherClassSet.has(String(id)));

    const [teacherAssignments, teacherClasses] = await Promise.all([
      getTeacherAssignments(teacherProfile._id),
      import("../models/Class.js").then((m) =>
        m.default
          .find({ _id: { $in: availableClassIds } })
          .select("_id classTeacher subjects.teacher subjects.subject")
          .lean()
      ),
    ]);

    const scopedSubjectSet = new Set();
    const allowedClassIdSet = new Set(availableClassIds.map((id) => String(id)));

    teacherAssignments.forEach((assignment) => {
      const classKey = String(assignment?.classId || "");
      const subjectKey = String(assignment?.subjectId || "");
      if (allowedClassIdSet.has(classKey) && subjectKey) {
        scopedSubjectSet.add(subjectKey);
      }
    });

    teacherClasses.forEach((classDoc) => {
      const isClassTeacher = String(classDoc?.classTeacher || "") === String(teacherProfile._id);
      (classDoc?.subjects || []).forEach((subjectRow) => {
        const subjectKey = String(subjectRow?.subject || "");
        if (!subjectKey) return;
        if (isClassTeacher || String(subjectRow?.teacher || "") === String(teacherProfile._id)) {
          scopedSubjectSet.add(subjectKey);
        }
      });
    });

    teacherScopedSubjectIds = Array.from(scopedSubjectSet);
  }

  const allClasses = await import("../models/Class.js").then((m) =>
    m.default.find({ _id: { $in: availableClassIds } }).select("_id name grade section").lean()
  );
  const allSubjects = await import("../models/Subject.js").then((m) => {
    const subjectQuery = { school: req.schoolId };
    if (req.user?.role === "teacher") {
      subjectQuery._id = { $in: teacherScopedSubjectIds || [] };
    }
    return m.default.find(subjectQuery).select("_id name code").lean();
  });

  if (!classId || !subjectId) {
    return res.json({
      success: true,
      data: {
        standards: [], students: [], matrix: {}, classAverage: {},
        pagination: { page, limit, total: 0, pages: 0 },
        filterOptions: { classes: allClasses, subjects: allSubjects, standards: [] },
        academicYear: effectiveAcademicYear, semester: effectiveSemester,
      },
    });
  }

  const allowedClassIds = availableClassIds.filter((id) => String(id) === String(classId));

  if (!allowedClassIds.length) {
    return res.json({
      success: true,
      data: {
        standards: [], students: [], matrix: {}, classAverage: {},
        pagination: { page, limit, total: 0, pages: 0 },
        filterOptions: { classes: allClasses, subjects: allSubjects, standards: [] },
        academicYear: effectiveAcademicYear, semester: effectiveSemester,
      },
    });
  }

  // Fetch assignments for this class + subject
  const semesterCondition = effectiveSemester
    ? { $or: [{ semester: effectiveSemester }, { semester: null }, { semester: { $exists: false } }] }
    : {};

  const assignmentQuery = {
    school: req.schoolId,
    isActive: true,
    class: { $in: allowedClassIds },
    subject: subjectId,
    "practiceConfig.sessionType": "assessment",
    ...semesterCondition,
  };

  const assignments = await StandardAssignment.find(assignmentQuery)
    .select("_id class subject standard students practiceConfig")
    .populate("standard", "code name description category masteryThreshold masteryMinQuestions")
    .lean();

  const assignmentIds = assignments.map((a) => a._id);

  // Build unique standards list (dedupe by code to avoid duplicate columns)
  const standardsMap = new Map();
  const standardIdToColumnId = new Map();
  const normalizeStandardToken = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[^a-z0-9.\-_]/g, "");

  assignments.forEach((a) => {
    const std = a.standard;
    if (!std?._id) return;

    const stdId = String(std._id);
    const normalizedCode = normalizeStandardToken(std.code);
    const normalizedName = normalizeStandardToken(std.name);
    const normalizedDesc = normalizeStandardToken(std.description);
    const dedupeKey = normalizedCode
      ? `code:${normalizedCode}`
      : normalizedName
        ? `name:${normalizedName}`
        : normalizedDesc
          ? `desc:${normalizedDesc}`
          : `id:${stdId}`;

    if (!standardsMap.has(dedupeKey)) {
      standardsMap.set(dedupeKey, {
        _id: std._id,
        code: std.code || "",
        name: std.name || "",
        description: std.description || "",
        category: std.category || "General",
      });
    } else {
      const existing = standardsMap.get(dedupeKey);
      if (!existing.description && std.description) existing.description = std.description;
      if (!existing.name && std.name) existing.name = std.name;
      if (!existing.code && std.code) existing.code = std.code;
    }

    const canonicalColumn = standardsMap.get(dedupeKey);
    standardIdToColumnId.set(stdId, String(canonicalColumn._id));
  });

  const assignmentStandardIds = [...new Set(assignments
    .map((a) => a?.standard?._id)
    .filter(Boolean)
    .map((id) => String(id))
  )];

  const standards = [...standardsMap.values()].sort((a, b) =>
    (a.code || a.name).localeCompare(b.code || b.name)
  );

  if (!standards.length) {
    return res.json({
      success: true,
      data: {
        standards: [], students: [], matrix: {}, classAverage: {},
        pagination: { page, limit, total: 0, pages: 0 },
        filterOptions: { classes: allClasses, subjects: allSubjects, standards: [] },
        academicYear: effectiveAcademicYear, semester: effectiveSemester,
      },
    });
  }

  // Fetch students
  const studentQuery = {
    school: req.schoolId,
    currentClass: { $in: allowedClassIds },
    status: "active",
    academicYear: effectiveAcademicYear,
  };

  let students = await Student.find(studentQuery)
    .select("_id firstName lastName middleName studentId currentClass")
    .lean();

  // Sort alphabetically
  students.sort((a, b) => {
    const na = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
    const nb = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
    return na.localeCompare(nb);
  });

  // Search filter
  const searchTerm = String(search || "").trim().toLowerCase();
  if (searchTerm) {
    students = students.filter((s) => {
      const hay = `${s.firstName || ""} ${s.middleName || ""} ${s.lastName || ""} ${s.studentId || ""}`.toLowerCase();
      return hay.includes(searchTerm);
    });
  }

  const allStudentIds = students.map((s) => String(s._id));
  const allStudentIdSet = new Set(allStudentIds);

  // Paginate students
  const totalStudents = students.length;
  const totalPages = totalStudents > 0 ? Math.ceil(totalStudents / limit) : 0;
  const pagedStudents = students.slice((page - 1) * limit, (page - 1) * limit + limit);
  const studentIds = pagedStudents.map((s) => s._id);

  // Fetch gradebook entries for all students × standards in scope
  const entryFilter = {
    school: req.schoolId,
    student: { $in: studentIds },
    assignment: { $in: assignmentIds },
    standard: { $in: assignmentStandardIds },
    class: { $in: allowedClassIds },
    subject: subjectId,
    academicYear: effectiveAcademicYear,
    status: "released",
  };
  if (effectiveSemester) {
    entryFilter.$or = [{ semester: effectiveSemester }, { semester: null }];
  }

  const entries = await StandardsGradebookEntry.find(entryFilter)
    .select("student standard percentage manualScore isManualEntry effectiveScore status updatedAt")
    .lean();

  // Build matrix
  const matrix = {};
  const scoreSumByStandard = {};
  const scoreCountByStandard = {};

  for (const student of pagedStudents) {
    const sid = String(student._id);
    matrix[sid] = {};
    for (const std of standards) {
      matrix[sid][String(std._id)] = { effectiveScore: null, isManual: false, percentage: null, hasAutoAssessment: false };
    }
  }

  const studentStandardAgg = new Map();
  for (const entry of entries) {
    const sid = String(entry.student);
    const rawStdId = String(entry.standard);
    const stdId = standardIdToColumnId.get(rawStdId) || rawStdId;
    if (!matrix[sid] || !matrix[sid][stdId]) continue;

    const percentage = Number.isFinite(entry.percentage) ? Number(entry.percentage) : null;
    const isManual = Boolean(entry.isManualEntry);
    let effectiveScore = entry.effectiveScore;

    // Compute effective if not stored yet
    if (effectiveScore === null || effectiveScore === undefined) {
      if (entry.manualScore !== null && entry.manualScore !== undefined) {
        effectiveScore = entry.manualScore;
      } else if (percentage !== null) {
        effectiveScore = percentageToScale4(percentage);
      }
    }

    if (effectiveScore === null || effectiveScore === undefined) continue;

    const key = `${sid}|${stdId}`;
    if (!studentStandardAgg.has(key)) {
      studentStandardAgg.set(key, {
        sid,
        stdId,
        scoreSum: 0,
        scoreCount: 0,
        percentageSum: 0,
        percentageCount: 0,
        manualCount: 0,
        latestTime: 0,
        latestScore: null,
        maxScore: -Infinity,
      });
    }

    const agg = studentStandardAgg.get(key);
    agg.scoreSum += Number(effectiveScore);
    agg.scoreCount += 1;
    if (percentage !== null) {
      agg.percentageSum += percentage;
      agg.percentageCount += 1;
    }
    if (isManual) agg.manualCount += 1;
    // Track for latest and highest
    const entryTime = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
    if (entryTime > (agg.latestTime || 0)) {
      agg.latestScore = Number(effectiveScore);
      agg.latestTime = entryTime;
    }
    if (Number(effectiveScore) > (agg.maxScore ?? -Infinity)) {
      agg.maxScore = Number(effectiveScore);
    }
  }

  for (const agg of studentStandardAgg.values()) {
    let finalScore;
    if (scoringMode === 'latest') {
      finalScore = agg.latestScore ?? Number((agg.scoreSum / agg.scoreCount).toFixed(2));
    } else if (scoringMode === 'highest') {
      finalScore = agg.maxScore !== -Infinity ? agg.maxScore : Number((agg.scoreSum / agg.scoreCount).toFixed(2));
    } else {
      finalScore = Number((agg.scoreSum / agg.scoreCount).toFixed(2));
    }
    matrix[agg.sid][agg.stdId] = {
      effectiveScore: finalScore,
      isManual: agg.manualCount > 0,
      percentage: agg.percentageCount > 0
        ? Number((agg.percentageSum / agg.percentageCount).toFixed(2))
        : null,
      hasAutoAssessment: agg.percentageCount > 0,
    };
  }

  // Compute class averages (across ALL students, not just paged)
  const allStudentObjectIds = students.map((s) => s._id);
  const allEntries = await StandardsGradebookEntry.find({
    ...entryFilter,
    student: { $in: allStudentObjectIds },
  }).select("student standard percentage manualScore isManualEntry effectiveScore updatedAt").lean();

  const allStudentStandardAgg = new Map();
  for (const entry of allEntries) {
    const sid = String(entry.student);
    const rawStdId = String(entry.standard);
    const stdId = standardIdToColumnId.get(rawStdId) || rawStdId;
    let score = entry.effectiveScore;
    if (score === null || score === undefined) {
      if (entry.manualScore !== null && entry.manualScore !== undefined) {
        score = entry.manualScore;
      } else if (Number.isFinite(entry.percentage)) {
        score = percentageToScale4(entry.percentage);
      }
    }
    if (score === null || score === undefined) continue;

    const key = `${sid}|${stdId}`;
    if (!allStudentStandardAgg.has(key)) {
      allStudentStandardAgg.set(key, {
        sid,
        stdId,
        scoreSum: 0,
        scoreCount: 0,
        latestTime: 0,
        latestScore: null,
        maxScore: -Infinity
      });
    }
    const agg = allStudentStandardAgg.get(key);
    agg.scoreSum += Number(score);
    agg.scoreCount += 1;
    const entryTime = entry.updatedAt ? new Date(entry.updatedAt).getTime() : 0;
    if (entryTime > (agg.latestTime || 0)) {
      agg.latestTime = entryTime;
      agg.latestScore = Number(score);
    }
    if (Number(score) > (agg.maxScore ?? -Infinity)) {
      agg.maxScore = Number(score);
    }
  }

  for (const agg of allStudentStandardAgg.values()) {
    let perStudentScore;
    if (scoringMode === 'latest') {
      perStudentScore = agg.latestScore ?? agg.scoreSum / agg.scoreCount;
    } else if (scoringMode === 'highest') {
      perStudentScore = agg.maxScore !== -Infinity ? agg.maxScore : agg.scoreSum / agg.scoreCount;
    } else {
      perStudentScore = agg.scoreSum / agg.scoreCount;
    }
    scoreSumByStandard[agg.stdId] = (scoreSumByStandard[agg.stdId] || 0) + perStudentScore;
    scoreCountByStandard[agg.stdId] = (scoreCountByStandard[agg.stdId] || 0) + 1;
  }

  const classAverage = {};
  for (const std of standards) {
    const key = String(std._id);
    if (scoreCountByStandard[key] > 0) {
      classAverage[key] = Number((scoreSumByStandard[key] / scoreCountByStandard[key]).toFixed(2));
    }
  }

  return res.json({
    success: true,
    data: {
      standards,
      students: pagedStudents.map((s) => ({
        _id: s._id,
        firstName: s.firstName || "",
        middleName: s.middleName || "",
        lastName: s.lastName || "",
        fullName: [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" "),
        studentId: s.studentId || "",
      })),
      matrix,
      classAverage,
      scoringMode,
      pagination: { page, limit, total: totalStudents, pages: totalPages },
      filterOptions: {
        classes: allClasses,
        subjects: allSubjects,
        standards,
      },
      academicYear: effectiveAcademicYear,
      semester: effectiveSemester,
    },
  });
});
