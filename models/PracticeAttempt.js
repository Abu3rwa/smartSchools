import mongoose from "mongoose";
import { tenantIsolationPlugin } from "../middleware/tenantIsolation.js";

const practiceAttemptSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: [true, "Student is required"],
    },
    standard: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Standard",
      required: [true, "Standard is required"],
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StandardAssignment",
      required: [true, "Assignment is required"],
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PracticeSession",
      default: null,
    },
    // Question details (AI-generated)
    questionText: {
      type: String,
      required: true,
    },
    questionType: {
      type: String,
      enum: ["multiple_choice", "short_answer", "true_false"],
      required: true,
    },
    sessionType: {
      type: String,
      enum: ["assessment", "homework", "classwork", "practice"],
      default: "practice",
    },
    options: [
      {
        label: { type: String }, // A, B, C, D
        text: { type: String },
      },
    ],
    correctAnswer: {
      type: String,
      required: true,
    },
    // Student response
    studentAnswer: {
      type: String,
      default: null,
    },
    isCorrect: {
      type: Boolean,
      default: null,
    },
    // AI evaluation feedback
    explanation: {
      type: String,
    },
    feedback: {
      type: String,
    },
    // Difficulty & sequencing
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    hintsUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    // Timing
    answeredAt: {
      type: Date,
    },
    timeSpentSeconds: {
      type: Number,
      default: 0,
    },
    // Status
    status: {
      type: String,
      enum: ["pending", "answered", "skipped"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for efficient queries
practiceAttemptSchema.index({ school: 1, student: 1, standard: 1 });
practiceAttemptSchema.index({ school: 1, student: 1, assignment: 1 });
practiceAttemptSchema.index({ school: 1, standard: 1, isCorrect: 1 });
practiceAttemptSchema.index({ student: 1, standard: 1, createdAt: -1 });
practiceAttemptSchema.index({ school: 1, session: 1, createdAt: -1 });

// Difficulty weights for weighted scoring (easy: 1x, medium: 1.5x, hard: 2x)
const DIFFICULTY_WEIGHTS = { easy: 1, medium: 1.5, hard: 2 };
const DEFAULT_STREAK_REQUIRED = 3;
const DECAY_DAYS = 14; // After this many days without practice, mastered standards get needsReview

function getWeight(difficulty) {
  return DIFFICULTY_WEIGHTS[difficulty] ?? 1;
}

/**
 * Compute current streak (consecutive correct from most recent) from sorted attempts (newest first).
 */
function computeCurrentStreak(attempts) {
  let streak = 0;
  for (const a of attempts) {
    if (a.isCorrect) streak++;
    else break;
  }
  return streak;
}

/**
 * Compute best streak (max consecutive correct) in attempts (newest first).
 */
function computeBestStreak(attempts) {
  let best = 0;
  let current = 0;
  for (const a of attempts) {
    if (a.isCorrect) current++;
    else {
      best = Math.max(best, current);
      current = 0;
    }
  }
  return Math.max(best, current);
}

/**
 * Static: Calculate mastery with lifetime stats, rolling window, weighted scoring, and consistency.
 * Returns { lifetimeStats, rollingWindowStats, masteryStatus, isMastered, masteredAt, needsReview, confidenceScore, needsMore }
 * Plus backward-compat: totalAttempts (lifetime), correctCount (rolling), percentage (rolling weighted %).
 */
practiceAttemptSchema.statics.calculateMastery = async function (
  studentId,
  standardId,
  threshold = 80,
  minQuestions = 5,
  streakRequired = DEFAULT_STREAK_REQUIRED,
  schoolId = null,
) {
  const MasteryRecord = (await import("./MasteryRecord.js")).default;

  const attemptQuery = {
    student: studentId,
    standard: standardId,
    status: "answered",
  };
  if (schoolId) attemptQuery.school = schoolId;

  const allAnswered = await this.find(attemptQuery)
    .sort({ createdAt: -1 })
    .select("isCorrect difficulty createdAt")
    .lean();

  const windowSize = Math.max(minQuestions, 10);
  const windowAttempts = allAnswered.slice(0, windowSize);

  // Lifetime stats
  const totalAttemptsAllTime = allAnswered.length;
  const totalCorrectAllTime = allAnswered.filter((a) => a.isCorrect).length;
  const lifetimeStats = {
    totalAttempts: totalAttemptsAllTime,
    correctCount: totalCorrectAllTime,
    percentage:
      totalAttemptsAllTime > 0
        ? Math.round((totalCorrectAllTime / totalAttemptsAllTime) * 100)
        : 0,
  };

  // Rolling window: weighted score
  let windowWeightedScore = 0;
  let windowWeightedMax = 0;
  windowAttempts.forEach((a) => {
    const w = getWeight(a.difficulty);
    windowWeightedMax += w;
    if (a.isCorrect) windowWeightedScore += w;
  });
  const windowCorrect = windowAttempts.filter((a) => a.isCorrect).length;
  const weightedPercentage =
    windowWeightedMax > 0
      ? Math.round((windowWeightedScore / windowWeightedMax) * 100)
      : 0;
  const simplePercentage =
    windowAttempts.length > 0
      ? Math.round((windowCorrect / windowAttempts.length) * 100)
      : 0;
  const currentStreak = computeCurrentStreak(windowAttempts);
  const bestStreak = computeBestStreak(allAnswered);
  const meetsStreak = currentStreak >= streakRequired;

  const rollingWindowStats = {
    windowAttempts: windowAttempts.length,
    windowCorrect,
    percentage: simplePercentage,
    weightedScore: Math.round(windowWeightedScore * 10) / 10,
    weightedMax: Math.round(windowWeightedMax * 10) / 10,
    weightedPercentage,
    currentStreak,
    bestStreak,
    meetsStreak,
  };

  // Persisted record (for sticky mastery and decay)
  const recordQuery = { student: studentId, standard: standardId };
  if (schoolId) recordQuery.school = schoolId;
  let record = await MasteryRecord.findOne(recordQuery).lean();
  const now = new Date();
  const lastPracticed = record?.lastPracticedAt
    ? new Date(record.lastPracticedAt)
    : null;
  const decayCutoff = new Date(
    now.getTime() - DECAY_DAYS * 24 * 60 * 60 * 1000,
  );
  const isDecayed =
    record?.isMastered &&
    !record?.needsReview &&
    lastPracticed &&
    lastPracticed < decayCutoff;

  let masteryStatus = "not_started";
  let isMastered = false;
  let masteredAt = record?.masteredAt || null;
  let needsReview = !!record?.needsReview || isDecayed;

  if (totalAttemptsAllTime === 0) {
    masteryStatus = "not_started";
  } else if (record?.isMastered && !needsReview) {
    masteryStatus = "mastered";
    isMastered = true;
  } else if (record?.isMastered && needsReview) {
    masteryStatus = "needs_review";
    isMastered = false; // treat as "needs practice" for UI actions
  } else {
    // Not yet mastered (or was and now in review): check if they qualify
    const meetsThreshold =
      windowAttempts.length >= minQuestions &&
      weightedPercentage >= threshold &&
      meetsStreak;
    if (meetsThreshold) {
      masteryStatus = "mastered";
      isMastered = true;
      // Caller will persist; we don't write here
    } else {
      masteryStatus = "in_progress";
    }
  }

  // Significant drop: if they had been mastered and rolling drops below 50%, mark needsReview (caller will persist)
  if (
    record?.isMastered &&
    !record?.needsReview &&
    !isDecayed &&
    windowAttempts.length >= 3 &&
    weightedPercentage < 50
  ) {
    needsReview = true;
    masteryStatus = "needs_review";
    isMastered = false;
  }

  // Confidence score 0–100 for UI progress bar (based on rolling performance and streak)
  let confidenceScore = 0;
  if (windowAttempts.length >= minQuestions) {
    confidenceScore = Math.min(
      100,
      Math.round(weightedPercentage * 0.85 + (meetsStreak ? 15 : 0)),
    );
  } else {
    confidenceScore = Math.round(
      (windowAttempts.length / minQuestions) * (weightedPercentage / 100) * 70,
    );
  }
  if (isMastered) confidenceScore = 100;

  const needsMore =
    windowAttempts.length < minQuestions
      ? minQuestions - windowAttempts.length
      : 0;

  return {
    lifetimeStats,
    rollingWindowStats,
    masteryStatus,
    isMastered,
    masteredAt,
    needsReview,
    confidenceScore,
    needsMore,
    bestStreak,
    // Backward compatibility and concise display
    totalAttempts: lifetimeStats.totalAttempts,
    correctCount: rollingWindowStats.windowCorrect,
    percentage: rollingWindowStats.weightedPercentage,
  };
};

/**
 * Static: Get overall progress for a student across all standards
 */
practiceAttemptSchema.statics.getStudentProgress = async function (
  studentId,
  assignmentIds = [],
) {
  const match = {
    student: new mongoose.Types.ObjectId(studentId),
    status: "answered",
  };
  if (assignmentIds.length > 0) {
    match.assignment = {
      $in: assignmentIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$standard",
        totalAttempts: { $sum: 1 },
        correctCount: { $sum: { $cond: ["$isCorrect", 1, 0] } },
        lastAttemptDate: { $max: "$createdAt" },
      },
    },
    {
      $project: {
        standard: "$_id",
        totalAttempts: 1,
        correctCount: 1,
        percentage: {
          $round: [
            {
              $multiply: [
                { $divide: ["$correctCount", "$totalAttempts"] },
                100,
              ],
            },
            0,
          ],
        },
        lastAttemptDate: 1,
      },
    },
  ]);

  return result;
};

// Apply tenant isolation plugin
practiceAttemptSchema.plugin(tenantIsolationPlugin);

const PracticeAttempt = mongoose.model(
  "PracticeAttempt",
  practiceAttemptSchema,
);
export default PracticeAttempt;
