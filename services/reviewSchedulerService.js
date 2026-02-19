import ReviewTask from '../models/ReviewTask.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import MasteryRecord from '../models/MasteryRecord.js';
import { computeReviewPriority } from './reviewScoringService.js';

const INTERVAL_DAYS = [1, 3, 7];

const REVIEW_QUEUE_ENABLED = () => process.env.REVIEW_QUEUE_ENABLED !== 'false';

const toDatePlusDays = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

const uniqueStrings = (items = [], limit = 6) => {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const value = String(item || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
};

async function getMasteryRecord(schoolId, studentId, standardId) {
  return MasteryRecord.findOne({ school: schoolId, student: studentId, standard: standardId })
    .select('isMastered needsReview lastPracticedAt')
    .lean();
}

async function createOrUpsertReviewTask({
  schoolId,
  studentId,
  standardId,
  assignmentId,
  classId,
  subjectId,
  sourceAttemptId,
  sourceReason,
  topicTags,
  intervalStage,
  intervalDays,
  priorityScore,
}) {
  const scheduledFor = toDatePlusDays(intervalDays);
  const dueBy = toDatePlusDays(intervalDays + 2);

  const activeStatuses = ['scheduled', 'in_progress'];

  const existing = await ReviewTask.findOne({
    school: schoolId,
    student: studentId,
    standard: standardId,
    intervalStage,
    status: { $in: activeStatuses },
  });

  if (existing) {
    existing.priorityScore = Math.max(existing.priorityScore || 0, priorityScore || 0);
    if (existing.scheduledFor > scheduledFor) existing.scheduledFor = scheduledFor;
    existing.dueBy = existing.dueBy || dueBy;
    existing.topicTags = uniqueStrings([...(existing.topicTags || []), ...(topicTags || [])], 10);
    if (!existing.assignment && assignmentId) existing.assignment = assignmentId;
    if (!existing.class && classId) existing.class = classId;
    if (!existing.subject && subjectId) existing.subject = subjectId;
    if (!existing.sourceAttemptId && sourceAttemptId) existing.sourceAttemptId = sourceAttemptId;
    await existing.save();
    return existing;
  }

  return ReviewTask.create({
    school: schoolId,
    student: studentId,
    standard: standardId,
    assignment: assignmentId || null,
    class: classId || null,
    subject: subjectId || null,
    sourceAttemptId: sourceAttemptId || null,
    sourceReason,
    topicTags: uniqueStrings(topicTags || [], 10),
    scheduledFor,
    dueBy,
    status: 'scheduled',
    intervalStage,
    intervalDays,
    priorityScore,
  });
}

export async function scheduleFromAttempt({ attempt }) {
  if (!REVIEW_QUEUE_ENABLED()) return null;
  if (!attempt || attempt.status !== 'answered') return null;

  const schoolId = attempt.school;
  const studentId = attempt.student;
  const standardId = attempt.standard;

  const sourceReason = !attempt.isCorrect
    ? 'incorrect_answer'
    : attempt?.feedbackParts?.confidenceLevel === 'low'
      ? 'low_confidence'
      : null;

  if (!sourceReason) return null;

  const masteryRecord = await getMasteryRecord(schoolId, studentId, standardId);
  const priorityScore = computeReviewPriority({
    attempt,
    masteryRecord,
    confidenceSignals: {
      confidenceLevel: attempt?.feedbackParts?.confidenceLevel,
    },
  });

  return createOrUpsertReviewTask({
    schoolId,
    studentId,
    standardId,
    assignmentId: attempt.assignment || null,
    classId: attempt.assignment?.class || null,
    subjectId: attempt.assignment?.subject || null,
    sourceAttemptId: attempt._id,
    sourceReason,
    topicTags: [
      attempt?.feedbackParts?.reviewTag,
      ...(attempt?.feedbackParts?.conceptChecks?.missing || []),
    ],
    intervalStage: 1,
    intervalDays: INTERVAL_DAYS[0],
    priorityScore,
  });
}

export async function scheduleForDecayScan({ schoolId, studentId = null }) {
  if (!REVIEW_QUEUE_ENABLED()) return { created: 0 };

  const query = {
    school: schoolId,
    isMastered: true,
    needsReview: true,
  };
  if (studentId) query.student = studentId;

  const masteryRecords = await MasteryRecord.find(query)
    .select('school student standard')
    .lean();

  let created = 0;
  for (const record of masteryRecords) {
    const task = await createOrUpsertReviewTask({
      schoolId: record.school,
      studentId: record.student,
      standardId: record.standard,
      sourceReason: 'decay_check',
      topicTags: ['review decay'],
      intervalStage: 1,
      intervalDays: INTERVAL_DAYS[0],
      priorityScore: 65,
    });
    if (task) created += 1;
  }

  return { created };
}

export async function getStudentReviewQueue({ studentId, limit = 20, now = new Date() }) {
  if (!REVIEW_QUEUE_ENABLED()) return [];

  const queue = await ReviewTask.find({
    student: studentId,
    status: { $in: ['scheduled', 'in_progress'] },
    scheduledFor: { $lte: new Date(now) },
  })
    .populate('standard', 'code name description gradeLevel')
    .populate('assignment', 'subject class')
    .sort({ priorityScore: -1, scheduledFor: 1, createdAt: 1 })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)))
    .lean();

  return queue;
}

export async function startReviewTask({ taskId, studentId }) {
  if (!REVIEW_QUEUE_ENABLED()) return null;

  const task = await ReviewTask.findOne({
    _id: taskId,
    student: studentId,
    status: 'scheduled',
  });

  if (!task) return null;
  task.status = 'in_progress';
  await task.save();
  return task;
}

export async function completeReviewTask({ taskId, studentId, outcome }) {
  if (!REVIEW_QUEUE_ENABLED()) return null;

  const task = await ReviewTask.findOne({
    _id: taskId,
    student: studentId,
    status: { $in: ['scheduled', 'in_progress'] },
  });
  if (!task) return null;

  const accuracy = Math.max(0, Math.min(100, Number(outcome?.accuracyAtCompletion ?? 0)));
  const attemptCount = Math.max(0, Number(outcome?.attemptCount ?? 0));

  task.status = 'completed';
  task.completion = {
    completedAt: new Date(),
    accuracyAtCompletion: accuracy,
    attemptCount,
  };
  await task.save();

  let nextStage = task.intervalStage;
  if (accuracy >= 80) {
    nextStage = Math.min(task.intervalStage + 1, INTERVAL_DAYS.length);
  } else if (accuracy < 60) {
    nextStage = 1;
  }

  if (nextStage > 0) {
    const intervalDays = INTERVAL_DAYS[nextStage - 1] || INTERVAL_DAYS[INTERVAL_DAYS.length - 1];
    await createOrUpsertReviewTask({
      schoolId: task.school,
      studentId: task.student,
      standardId: task.standard,
      assignmentId: task.assignment,
      classId: task.class,
      subjectId: task.subject,
      sourceReason: accuracy >= 80 ? 'decay_check' : 'incorrect_answer',
      topicTags: task.topicTags,
      intervalStage: nextStage,
      intervalDays,
      priorityScore: Math.max(40, task.priorityScore - (accuracy >= 80 ? 10 : 0)),
    });
  }

  return task;
}

export async function expireStaleReviewTasks({ beforeDate = new Date() } = {}) {
  if (!REVIEW_QUEUE_ENABLED()) return { modifiedCount: 0 };

  const result = await ReviewTask.updateMany(
    {
      status: { $in: ['scheduled', 'in_progress'] },
      dueBy: { $lt: beforeDate },
    },
    {
      $set: { status: 'expired' },
    }
  );

  return { modifiedCount: result.modifiedCount || 0 };
}
