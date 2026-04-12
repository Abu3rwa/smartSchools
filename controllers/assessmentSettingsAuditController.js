import { asyncHandler } from '../middleware/errorHandler.js';
import { getSettings, updateSettings } from '../services/assessmentSettingsService.js';
import { queryAuditLogs } from '../services/assessmentAuditService.js';
import logger from '../utils/logger.js';

// ── Settings Controllers ──

/**
 * GET /api/standard-assessment/settings/:section
 * Get assessment settings for the school (or a specific section).
 */
export const getAssessmentSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings(req.schoolId);
  const { section } = req.params;

  if (section && settings[section] !== undefined) {
    return res.json({ success: true, data: { [section]: settings[section] } });
  }

  return res.json({ success: true, data: settings });
});

/**
 * PUT /api/standard-assessment/settings/:section
 * Update assessment settings for the school.
 */
export const updateAssessmentSettings = asyncHandler(async (req, res) => {
  const { section } = req.params;
  let updates = req.body;

  // If section is specified, wrap the update in the section key
  if (section && section !== 'global') {
    updates = { [section]: req.body };
  }

  const result = await updateSettings(
    req.schoolId,
    updates,
    req.user._id,
    req.ip
  );

  return res.json({ success: true, data: result });
});

// ── Audit Log Controllers ──

/**
 * GET /api/standard-assessment/audit-logs
 * Query assessment audit logs with filters and pagination.
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const {
    action, performedBy, studentId, assignmentId,
    dateFrom, dateTo, page, limit,
  } = req.query;

  const result = await queryAuditLogs({
    schoolId: req.schoolId,
    action,
    performedBy,
    studentId,
    assignmentId,
    dateFrom,
    dateTo,
    page: page || 1,
    limit: limit || 50,
  });

  return res.json({ success: true, data: result });
});

/**
 * POST /api/standard-assessment/audit-logs/export
 * Export audit logs as CSV.
 */
export const exportAuditLogs = asyncHandler(async (req, res) => {
  const { action, performedBy, studentId, assignmentId, dateFrom, dateTo } = req.body;

  const result = await queryAuditLogs({
    schoolId: req.schoolId,
    action,
    performedBy,
    studentId,
    assignmentId,
    dateFrom,
    dateTo,
    page: 1,
    limit: 10000,
  });

  // Build CSV
  const headers = [
    'Date', 'Action', 'Performed By', 'Student', 'Assignment',
    'Message Type', 'Recipients', 'Email Status', 'InApp Status',
  ];
  const csvRows = [headers.join(',')];

  for (const log of result.logs) {
    const row = [
      log.createdAt ? new Date(log.createdAt).toISOString() : '',
      log.action || '',
      log.performedBy ? `${log.performedBy.firstName || ''} ${log.performedBy.lastName || ''}`.trim() : '',
      log.student ? `${log.student.firstName || ''} ${log.student.lastName || ''}`.trim() : '',
      log.assignment?.title || '',
      log.messageType || '',
      (log.recipientTypes || []).join(';'),
      log.channelStatus?.email || '',
      log.channelStatus?.inApp || '',
    ];
    csvRows.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }

  const csv = csvRows.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
  return res.send(csv);
});
