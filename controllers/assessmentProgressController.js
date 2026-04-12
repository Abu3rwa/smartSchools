import { asyncHandler } from '../middleware/errorHandler.js';
import { buildProgressTable, sendProgressTable } from '../services/assessmentProgressService.js';
import logger from '../utils/logger.js';

/**
 * GET /api/standard-assessment/progress-table
 * Build the progress table for a student.
 */
export const getProgressTable = asyncHandler(async (req, res) => {
  const { classId, studentId, subjectId, gradeLevel, dateFrom, dateTo } = req.query;

  if (!studentId) {
    return res.status(400).json({ success: false, message: 'studentId is required.' });
  }

  const rows = await buildProgressTable({
    schoolId: req.schoolId,
    classId,
    studentId,
    subjectId,
    gradeLevel,
    dateFrom,
    dateTo,
  });

  return res.json({ success: true, data: { rows, totalRows: rows.length } });
});

/**
 * POST /api/standard-assessment/progress-table/send
 * Send selected progress table rows to recipients.
 */
export const sendProgressTableRows = asyncHandler(async (req, res) => {
  const {
    studentId, classId, subjectId,
    selectedRows, sendToStudent, sendToParent, optionalMessage,
  } = req.body;

  if (!studentId) {
    return res.status(400).json({ success: false, message: 'studentId is required.' });
  }
  if (!selectedRows || !Array.isArray(selectedRows) || selectedRows.length === 0) {
    return res.status(400).json({ success: false, message: 'selectedRows is required.' });
  }

  const result = await sendProgressTable({
    schoolId: req.schoolId,
    userId: req.user._id,
    studentId,
    classId,
    subjectId,
    selectedRows,
    sendToStudent: !!sendToStudent,
    sendToParent: !!sendToParent,
    optionalMessage,
    ipAddress: req.ip,
  });

  return res.json({ success: true, data: result });
});
