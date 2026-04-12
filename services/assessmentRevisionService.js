import AssessmentRevision from '../models/AssessmentRevision.js';
import StandardAssignment from '../models/StandardAssignment.js';
import StandardQuestionPool from '../models/StandardQuestionPool.js';
import PracticeAttempt from '../models/PracticeAttempt.js';
import Student from '../models/Student.js';
import Notification from '../models/Notification.js';
import { writeAuditLog } from './assessmentAuditService.js';
import { getSettings } from './assessmentSettingsService.js';
import logger from '../utils/logger.js';

/**
 * Compute the impact of editing a live assessment:
 * how many students have completed, are in-progress, or haven't started.
 */
export async function getEditImpact(schoolId, assignmentId) {
  const assignment = await StandardAssignment.findOne({
    _id: assignmentId,
    school: schoolId,
    isActive: true,
  })
    .populate('students', '_id')
    .lean();

  if (!assignment) {
    const err = new Error('Assignment not found.');
    err.statusCode = 404;
    throw err;
  }

  // Get all student IDs for this assignment
  let targetStudentIds = [];
  if (assignment.students && assignment.students.length > 0) {
    targetStudentIds = assignment.students.map((s) => s._id || s);
  } else {
    // All students in the class
    const students = await Student.find({
      school: schoolId,
      class: assignment.class,
      isActive: true,
    }).select('_id').lean();
    targetStudentIds = students.map((s) => s._id);
  }

  // Get attempt data for this assignment
  const attempts = await PracticeAttempt.find({
    school: schoolId,
    assignment: assignmentId,
  }).select('student status').lean();

  const attemptByStudent = {};
  for (const a of attempts) {
    const sid = String(a.student);
    if (!attemptByStudent[sid]) attemptByStudent[sid] = [];
    attemptByStudent[sid].push(a);
  }

  let completedStudents = 0;
  let inProgressStudents = 0;
  let notStartedStudents = 0;

  for (const sid of targetStudentIds) {
    const studentAttempts = attemptByStudent[String(sid)] || [];
    if (studentAttempts.length === 0) {
      notStartedStudents++;
    } else {
      const hasAnswered = studentAttempts.some((a) => a.status === 'answered');
      const allAnswered = studentAttempts.every((a) => a.status === 'answered');
      if (allAnswered && studentAttempts.length > 0) {
        completedStudents++;
      } else if (hasAnswered) {
        inProgressStudents++;
      } else {
        // All pending
        inProgressStudents++;
      }
    }
  }

  // Determine allowed operations
  const settings = await getSettings(schoolId);
  const hasStudentsStarted = completedStudents > 0 || inProgressStudents > 0;

  const allowedOperations = {
    metadataEdit: true,
    contentEdit: settings.liveEdit?.allowContentEditAfterStart !== false || !hasStudentsStarted,
    questionAdd: settings.liveEdit?.allowQuestionAddition !== false,
    questionRemove: settings.liveEdit?.allowQuestionRemoval !== false,
    scoringWeightChange: settings.liveEdit?.allowScoringWeightChange !== false,
  };

  // Check revision count limit
  const existingRevisions = await AssessmentRevision.countDocuments({
    school: schoolId,
    assignment: assignmentId,
  });
  const maxRevisions = settings.liveEdit?.maxRevisionsPerAssessment || 10;
  allowedOperations.canCreateRevision = existingRevisions < maxRevisions;

  // Check lock window
  if (settings.liveEdit?.lockBeforeDueDate && assignment.dueDate) {
    const lockHours = settings.liveEdit?.lockWindowHours || 24;
    const lockTime = new Date(assignment.dueDate.getTime() - lockHours * 3600 * 1000);
    if (new Date() >= lockTime) {
      allowedOperations.contentEdit = false;
      allowedOperations.lockedReason = `Content edits are locked ${lockHours}h before due date.`;
    }
  }

  return {
    assignmentId,
    hasStudentsStarted,
    completedStudents,
    inProgressStudents,
    notStartedStudents,
    totalStudents: targetStudentIds.length,
    existingRevisions,
    maxRevisions,
    allowedOperations,
    currentVersion: assignment.currentVersion || 1,
  };
}

/**
 * Apply a metadata-only edit to an assignment (no new revision needed).
 */
export async function applyMetadataEdit(schoolId, assignmentId, userId, updates, ipAddress) {
  const allowedMetadata = ['title', 'instructions', 'dueDate'];
  const patch = {};
  for (const key of allowedMetadata) {
    if (updates[key] !== undefined) {
      patch[key] = updates[key];
    }
  }

  if (Object.keys(patch).length === 0) {
    const err = new Error('No valid metadata fields to update.');
    err.statusCode = 400;
    throw err;
  }

  const before = await StandardAssignment.findOne({
    _id: assignmentId,
    school: schoolId,
    isActive: true,
  }).lean();

  if (!before) {
    const err = new Error('Assignment not found.');
    err.statusCode = 404;
    throw err;
  }

  const updated = await StandardAssignment.findByIdAndUpdate(
    assignmentId,
    { $set: patch },
    { new: true, runValidators: true }
  ).lean();

  await writeAuditLog({
    school: schoolId,
    action: 'assessment_edited',
    messageType: 'revision',
    performedBy: userId,
    assignment: assignmentId,
    beforeState: { title: before.title, instructions: before.instructions, dueDate: before.dueDate },
    afterState: patch,
    ipAddress,
  });

  return updated;
}

/**
 * Create a new content revision for a live assessment.
 */
export async function createRevision({
  schoolId,
  userId,
  assignmentId,
  contentSnapshot,
  changeSummary,
  changeType,
  revisionPolicy,
}) {
  const settings = await getSettings(schoolId);

  // Verify content edits are allowed
  if (!settings.liveEdit?.allowContentEditAfterStart) {
    const err = new Error('Content editing after start is disabled by school settings.');
    err.statusCode = 403;
    throw err;
  }

  const assignment = await StandardAssignment.findOne({
    _id: assignmentId,
    school: schoolId,
    isActive: true,
  });

  if (!assignment) {
    const err = new Error('Assignment not found.');
    err.statusCode = 404;
    throw err;
  }

  // Check max revisions
  const existingCount = await AssessmentRevision.countDocuments({
    school: schoolId,
    assignment: assignmentId,
  });
  const maxRevisions = settings.liveEdit?.maxRevisionsPerAssessment || 10;
  if (existingCount >= maxRevisions) {
    const err = new Error(`Maximum revision limit reached (${maxRevisions}).`);
    err.statusCode = 400;
    throw err;
  }

  // Validate revision policy against allowed policies
  const allowedPolicies = settings.liveEdit?.allowedRevisionPolicies || ['not-started-only'];
  const policy = revisionPolicy || settings.liveEdit?.defaultRevisionPolicy || 'not-started-only';
  if (!allowedPolicies.includes(policy)) {
    const err = new Error(`Revision policy "${policy}" is not allowed. Allowed: ${allowedPolicies.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const newVersionNumber = (assignment.currentVersion || 1) + 1;

  // Compute impact snapshot
  const impact = await getEditImpact(schoolId, assignmentId);

  const revision = await AssessmentRevision.create({
    school: schoolId,
    assignment: assignmentId,
    versionNumber: newVersionNumber,
    contentSnapshot,
    changeSummary: changeSummary || '',
    changeType: changeType || 'content',
    publishStatus: 'draft',
    revisionPolicy: policy,
    createdBy: userId,
    impactSnapshot: {
      completedStudents: impact.completedStudents,
      inProgressStudents: impact.inProgressStudents,
      notStartedStudents: impact.notStartedStudents,
    },
  });

  await writeAuditLog({
    school: schoolId,
    action: 'revision_created',
    messageType: 'revision',
    performedBy: userId,
    assignment: assignmentId,
    revision: revision._id,
    payload: {
      versionNumber: newVersionNumber,
      changeType,
      changeSummary,
      policy,
    },
  });

  return revision.toObject();
}

/**
 * Publish a revision, making it effective for the targeted audience.
 */
export async function publishRevision({
  schoolId,
  userId,
  assignmentId,
  versionNumber,
  ipAddress,
}) {
  const settings = await getSettings(schoolId);

  const revision = await AssessmentRevision.findOne({
    school: schoolId,
    assignment: assignmentId,
    versionNumber,
    publishStatus: 'draft',
    isActive: true,
  });

  if (!revision) {
    const err = new Error('Revision draft not found.');
    err.statusCode = 404;
    throw err;
  }

  // Publish the revision
  revision.publishStatus = 'published';
  revision.publishedBy = userId;
  revision.publishedAt = new Date();
  revision.effectiveFrom = new Date();
  await revision.save();

  // Update the assignment's current version
  await StandardAssignment.findByIdAndUpdate(assignmentId, {
    $set: { currentVersion: versionNumber },
  });

  // Update the question pool if content snapshot has questions
  if (revision.contentSnapshot?.questions?.length > 0) {
    const pool = await StandardQuestionPool.findOne({
      school: schoolId,
      assignment: assignmentId,
    });
    if (pool) {
      pool.questions = revision.contentSnapshot.questions;
      pool.currentVersion = versionNumber;
      pool.editHistory.push({
        version: versionNumber,
        editedBy: userId,
        editedAt: new Date(),
        changeSummary: revision.changeSummary || 'Published revision',
      });
      await pool.save();
    }
  }

  // Send notifications if enabled
  const sendNotifications = async (type, userQuery) => {
    const users = await Student.find(userQuery).populate('user', '_id').lean();
    const notifs = users
      .filter((s) => s.user?._id)
      .map((s) => ({
        school: schoolId,
        user: s.user._id,
        type: 'assessment_revision_published',
        title: 'Assessment Updated',
        message: `An assessment has been updated to version ${versionNumber}. ${revision.changeSummary || ''}`,
        data: { assignmentId, versionNumber },
      }));
    if (notifs.length > 0) {
      await Notification.insertMany(notifs).catch((err) => {
        logger.error('Failed to send revision notifications', { error: err.message });
      });
    }
  };

  if (settings.liveEdit?.notifyStudentsOnRevision) {
    const assignment = await StandardAssignment.findById(assignmentId).lean();
    const studentQuery = { school: schoolId, class: assignment.class, isActive: true };
    await sendNotifications('student', studentQuery);
  }

  await writeAuditLog({
    school: schoolId,
    action: 'revision_published',
    messageType: 'revision',
    performedBy: userId,
    assignment: assignmentId,
    revision: revision._id,
    payload: {
      versionNumber,
      revisionPolicy: revision.revisionPolicy,
      impactSnapshot: revision.impactSnapshot,
    },
    ipAddress,
  });

  return revision.toObject();
}

/**
 * Get the revision history for an assignment.
 */
export async function getRevisionHistory(schoolId, assignmentId) {
  const revisions = await AssessmentRevision.find({
    school: schoolId,
    assignment: assignmentId,
    isActive: true,
  })
    .sort({ versionNumber: -1 })
    .populate('createdBy', 'firstName lastName email')
    .populate('publishedBy', 'firstName lastName email')
    .lean();

  return revisions;
}

export default {
  getEditImpact,
  applyMetadataEdit,
  createRevision,
  publishRevision,
  getRevisionHistory,
};
