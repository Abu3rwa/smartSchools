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

export default { writeAuditLog };
