import AssessmentAuditLog from '../models/AssessmentAuditLog.js';
import logger from '../utils/logger.js';

/**
 * Write an audit log entry for any assessment-related action.
 */
export async function writeAuditLog({
  school,
  action,
  messageType = null,
  performedBy,
  student = null,
  class: classId = null,
  subject = null,
  assignment = null,
  narrativeReport = null,
  revision = null,
  recipientTypes = [],
  recipientIds = [],
  selectedStandardRowIds = [],
  payload = null,
  channelStatus = {},
  idempotencyKey = null,
  beforeState = null,
  afterState = null,
  ipAddress = null,
}) {
  try {
    if (idempotencyKey) {
      const existing = await AssessmentAuditLog.findOne({ idempotencyKey })
        .setOptions({ skipTenantFilter: true })
        .lean();
      if (existing) {
        logger.info(`Duplicate audit log skipped: ${idempotencyKey}`);
        return existing;
      }
    }

    const entry = await AssessmentAuditLog.create({
      school,
      action,
      messageType,
      performedBy,
      student,
      class: classId,
      subject,
      assignment,
      narrativeReport,
      revision,
      recipientTypes,
      recipientIds,
      selectedStandardRowIds,
      payload,
      channelStatus,
      idempotencyKey,
      beforeState,
      afterState,
      ipAddress,
    });

    return entry;
  } catch (err) {
    logger.error('Failed to write assessment audit log', { error: err.message, action });
    return null;
  }
}

/**
 * Query audit logs with filters and pagination.
 */
export async function queryAuditLogs({
  schoolId,
  action,
  performedBy,
  studentId,
  assignmentId,
  dateFrom,
  dateTo,
  page = 1,
  limit = 50,
}) {
  const query = {};
  if (schoolId) query.school = schoolId;
  if (action) query.action = action;
  if (performedBy) query.performedBy = performedBy;
  if (studentId) query.student = studentId;
  if (assignmentId) query.assignment = assignmentId;
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
    if (dateTo) query.createdAt.$lte = new Date(dateTo);
  }

  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const total = await AssessmentAuditLog.countDocuments(query);
  const logs = await AssessmentAuditLog.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('performedBy', 'firstName lastName email role')
    .populate('student', 'firstName lastName')
    .populate('assignment', 'title')
    .lean();

  return {
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  };
}

export default { writeAuditLog, queryAuditLogs };
