import { asyncHandler } from '../middleware/errorHandler.js';
import {
  generateNarrative,
  updateNarrative,
  sendNarrative,
} from '../services/assessmentNarrativeService.js';
import AssessmentNarrative from '../models/AssessmentNarrative.js';
import logger from '../utils/logger.js';

/**
 * POST /api/standard-assessment/narrative/generate
 * Generate an AI narrative draft for selected standards.
 */
export const generateNarrativeDraft = asyncHandler(async (req, res) => {
  const { studentId, classId, subjectId, selectedStandardIds, language, toneProfile } = req.body;

  if (!studentId || !classId || !subjectId) {
    return res.status(400).json({
      success: false,
      message: 'studentId, classId, and subjectId are required.',
    });
  }
  if (!selectedStandardIds || !Array.isArray(selectedStandardIds) || selectedStandardIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'selectedStandardIds is required.',
    });
  }

  const result = await generateNarrative({
    schoolId: req.schoolId,
    userId: req.user._id,
    studentId,
    classId,
    subjectId,
    selectedStandardIds,
    language,
    toneProfile,
  });

  return res.status(201).json({ success: true, data: result });
});

/**
 * GET /api/standard-assessment/narrative/:id
 * Get a narrative draft by ID.
 */
export const getNarrativeDraft = asyncHandler(async (req, res) => {
  const narrative = await AssessmentNarrative.findOne({
    _id: req.params.id,
    school: req.schoolId,
    isActive: true,
  })
    .populate('selectedStandardIds', 'code name')
    .populate('createdByTeacherId', 'firstName lastName')
    .populate('approvedByTeacherId', 'firstName lastName')
    .lean();

  if (!narrative) {
    return res.status(404).json({ success: false, message: 'Narrative not found.' });
  }

  return res.json({ success: true, data: narrative });
});

/**
 * PATCH /api/standard-assessment/narrative/:id
 * Update a narrative draft (teacher edit + optional approval).
 */
export const patchNarrative = asyncHandler(async (req, res) => {
  const { teacherEditedText, approvalConfirmed } = req.body;

  const result = await updateNarrative({
    schoolId: req.schoolId,
    userId: req.user._id,
    narrativeId: req.params.id,
    teacherEditedText,
    approvalConfirmed,
  });

  return res.json({ success: true, data: result });
});

/**
 * POST /api/standard-assessment/narrative/:id/send
 * Send an approved narrative to recipients.
 */
export const sendNarrativeReport = asyncHandler(async (req, res) => {
  const { sendToStudent, sendToParent, attachProgressTable, selectedRows } = req.body;

  const result = await sendNarrative({
    schoolId: req.schoolId,
    userId: req.user._id,
    narrativeId: req.params.id,
    sendToStudent: !!sendToStudent,
    sendToParent: !!sendToParent,
    attachProgressTable: !!attachProgressTable,
    selectedRows,
    ipAddress: req.ip,
  });

  return res.json({ success: true, data: result });
});

/**
 * GET /api/standard-assessment/narratives
 * List narratives for a teacher (with optional filters).
 */
export const listNarratives = asyncHandler(async (req, res) => {
  const { studentId, classId, status, page = 1, limit = 25 } = req.query;

  const query = { school: req.schoolId, isActive: true };
  if (studentId) query.student = studentId;
  if (classId) query.class = classId;
  if (status) query.status = status;

  // Non-admin users can only see their own narratives
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    query.createdByTeacherId = req.user._id;
  }

  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const total = await AssessmentNarrative.countDocuments(query);
  const narratives = await AssessmentNarrative.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('student', 'firstName lastName')
    .populate('selectedStandardIds', 'code name')
    .lean();

  return res.json({
    success: true,
    data: {
      narratives,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    },
  });
});
