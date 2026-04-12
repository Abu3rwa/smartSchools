import PracticeAttempt from '../models/PracticeAttempt.js';
import StandardAssignment from '../models/StandardAssignment.js';
import Standard from '../models/Standard.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import { writeAuditLog } from './assessmentAuditService.js';
import { getSettings } from './assessmentSettingsService.js';
import AssessmentAuditLog from '../models/AssessmentAuditLog.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Build the progress table for a student, aggregating attempt data per standard.
 */
export async function buildProgressTable({
  schoolId,
  classId,
  studentId,
  subjectId,
  gradeLevel,
  dateFrom,
  dateTo,
}) {
  const settings = await getSettings(schoolId);

  // Get all assignments for the class/subject
  const assignmentQuery = {
    school: schoolId,
    isActive: true,
  };
  if (classId) assignmentQuery.class = classId;
  if (subjectId) assignmentQuery.subject = subjectId;

  const assignments = await StandardAssignment.find(assignmentQuery)
    .populate('standard', 'code name gradeLevel')
    .lean();

  if (gradeLevel) {
    assignments.filter((a) => a.standard?.gradeLevel === parseInt(gradeLevel));
  }

  // Get all attempts for this student
  const attemptQuery = {
    school: schoolId,
    student: studentId,
    status: 'answered',
  };
  if (dateFrom || dateTo) {
    attemptQuery.createdAt = {};
    if (dateFrom) attemptQuery.createdAt.$gte = new Date(dateFrom);
    if (dateTo) attemptQuery.createdAt.$lte = new Date(dateTo);
  }

  const attempts = await PracticeAttempt.find(attemptQuery)
    .sort({ createdAt: -1 })
    .lean();

  // Group attempts by standard
  const standardMap = new Map();

  for (const assignment of assignments) {
    const stdId = String(assignment.standard?._id);
    if (!standardMap.has(stdId)) {
      standardMap.set(stdId, {
        standardId: assignment.standard?._id,
        standardCode: assignment.standard?.code || '',
        standardName: assignment.standard?.name || '',
        gradeLevel: assignment.standard?.gradeLevel,
        attempts: [],
        assignmentIds: [],
      });
    }
    standardMap.get(stdId).assignmentIds.push(assignment._id);
  }

  // Map attempts to standards
  for (const attempt of attempts) {
    const stdId = String(attempt.standard);
    if (standardMap.has(stdId)) {
      standardMap.get(stdId).attempts.push(attempt);
    }
  }

  // Build rows
  const rows = [];
  for (const [stdId, data] of standardMap) {
    const finishedAttempts = data.attempts.filter((a) => a.isCorrect !== null);
    const isFinished = finishedAttempts.length > 0;
    const attemptsCount = finishedAttempts.length;
    const scores = finishedAttempts.map((a) => (a.isCorrect ? 100 : 0));
    const averageScore = scores.length > 0
      ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
      : null;
    const latestScore = finishedAttempts.length > 0
      ? (finishedAttempts[0].isCorrect ? 100 : 0)
      : null;
    const lastAttemptDate = finishedAttempts.length > 0
      ? finishedAttempts[0].answeredAt || finishedAttempts[0].createdAt
      : null;

    rows.push({
      standardId: data.standardId,
      standardCode: data.standardCode,
      standardName: data.standardName,
      gradeLevel: data.gradeLevel,
      date: lastAttemptDate,
      latestScore,
      attemptsCount,
      averageScore,
      status: isFinished ? 'Finished' : 'Unfinished',
    });
  }

  // Sort: finished first, then by standard code
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'Finished' ? -1 : 1;
    return (a.standardCode || '').localeCompare(b.standardCode || '');
  });

  return rows;
}

/**
 * Send selected progress table rows to recipients.
 */
export async function sendProgressTable({
  schoolId,
  userId,
  studentId,
  classId,
  subjectId,
  selectedRows,
  sendToStudent,
  sendToParent,
  optionalMessage,
  ipAddress,
}) {
  const settings = await getSettings(schoolId);

  // Validate at least one recipient
  if (!sendToStudent && !sendToParent) {
    const err = new Error('Select at least one recipient (Student or Parent).');
    err.statusCode = 400;
    throw err;
  }

  // Enforce unfinished row restriction
  if (!settings.progressSend?.allowSendUnfinishedRows) {
    const hasUnfinished = selectedRows.some((r) => r.status === 'Unfinished');
    if (hasUnfinished) {
      const err = new Error('Sending unfinished rows is currently disabled by school settings.');
      err.statusCode = 403;
      throw err;
    }
  }

  // Enforce minimum finished rows
  const minFinished = settings.progressSend?.requireMinFinishedRows || 0;
  const finishedCount = selectedRows.filter((r) => r.status === 'Finished').length;
  if (finishedCount < minFinished) {
    const err = new Error(`At least ${minFinished} finished row(s) required to send.`);
    err.statusCode = 400;
    throw err;
  }

  // Rate limit: sends per student per day
  const maxSends = settings.progressSend?.maxSendsPerStudentPerDay || 3;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySendCount = await AssessmentAuditLog.countDocuments({
    school: schoolId,
    action: 'progress_table_sent',
    student: studentId,
    createdAt: { $gte: todayStart },
  });
  if (todaySendCount >= maxSends) {
    const err = new Error(`Daily send limit for this student reached (${maxSends}).`);
    err.statusCode = 429;
    throw err;
  }

  // Cooldown check
  const cooldownMin = settings.progressSend?.cooldownMinutes || 60;
  if (cooldownMin > 0) {
    const cooldownSince = new Date(Date.now() - cooldownMin * 60 * 1000);
    const recentSend = await AssessmentAuditLog.findOne({
      school: schoolId,
      action: 'progress_table_sent',
      student: studentId,
      performedBy: userId,
      createdAt: { $gte: cooldownSince },
    }).lean();
    if (recentSend) {
      const err = new Error(`Please wait ${cooldownMin} minutes between sends to the same student.`);
      err.statusCode = 429;
      throw err;
    }
  }

  // Validate teacher note
  if (optionalMessage) {
    const maxLen = settings.progressSend?.maxTeacherNoteLength || 1000;
    if (!settings.progressSend?.allowTeacherNote) {
      const err = new Error('Teacher notes are disabled by school settings.');
      err.statusCode = 403;
      throw err;
    }
    if (optionalMessage.length > maxLen) {
      const err = new Error(`Teacher note must be ${maxLen} characters or fewer.`);
      err.statusCode = 400;
      throw err;
    }
  }

  // Build summary
  const unfinishedCount = selectedRows.filter((r) => r.status === 'Unfinished').length;
  const overallAverage = finishedCount > 0
    ? Math.round(
        selectedRows
          .filter((r) => r.status === 'Finished' && r.averageScore != null)
          .reduce((s, r) => s + r.averageScore, 0) / finishedCount
      )
    : null;

  const summary = {
    totalSelected: selectedRows.length,
    finishedCount,
    unfinishedCount,
    overallAverage,
  };

  // Idempotency key
  const idempotencyKey = crypto
    .createHash('sha256')
    .update(
      `${schoolId}:${userId}:${studentId}:${selectedRows.map((r) => r.standardId).join(',')}:${Date.now()}`
    )
    .digest('hex');

  // Resolve recipients
  const recipientTypes = [];
  const recipientIds = [];
  const channelStatus = { email: null, inApp: null };

  const student = await Student.findById(studentId)
    .populate('user', 'email firstName lastName')
    .lean();

  if (sendToStudent && student?.user) {
    recipientTypes.push('student');
    recipientIds.push(student.user._id);
    channelStatus.inApp = 'pending';
    if (student.user.email) channelStatus.email = 'pending';
  }

  if (sendToParent) {
    recipientTypes.push('parent');
    // Find parent via student.parents or User with role parent linked to school
    const parentUsers = await User.find({
      school: schoolId,
      role: 'parent',
      'children': studentId,
      isActive: true,
    }).select('_id email firstName lastName').lean();

    for (const p of parentUsers) {
      recipientIds.push(p._id);
    }
    if (parentUsers.length === 0) {
      logger.warn(`No parent found for student ${studentId}`);
    }
  }

  // Create in-app notifications
  const notifications = [];
  for (const recipientId of recipientIds) {
    notifications.push({
      school: schoolId,
      user: recipientId,
      type: 'assessment_progress_report',
      title: 'Standards Assessment Progress Report',
      message: `Progress report sent by your teacher. ${summary.totalSelected} standard(s) included.`,
      data: {
        studentId,
        classId,
        subjectId,
        summary,
        selectedRows: settings.audit?.logProgressTableContent ? selectedRows : undefined,
        teacherNote: optionalMessage || null,
      },
    });
  }
  if (notifications.length > 0) {
    await Notification.insertMany(notifications).catch((err) => {
      logger.error('Failed to create progress notifications', { error: err.message });
    });
  }

  // Write audit log
  const audit = await writeAuditLog({
    school: schoolId,
    action: 'progress_table_sent',
    messageType: 'table',
    performedBy: userId,
    student: studentId,
    class: classId,
    subject: subjectId,
    recipientTypes,
    recipientIds,
    selectedStandardRowIds: selectedRows.map((r) => r.standardId),
    payload: {
      summary,
      teacherNote: optionalMessage || null,
      rows: settings.audit?.logProgressTableContent ? selectedRows : undefined,
    },
    channelStatus,
    idempotencyKey,
    ipAddress,
  });

  return {
    sent: true,
    summary,
    recipientCount: recipientIds.length,
    auditId: audit?._id,
  };
}

export default { buildProgressTable, sendProgressTable };
