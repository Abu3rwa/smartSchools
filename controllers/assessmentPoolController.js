import { asyncHandler } from '../middleware/errorHandler.js';
import { browsePool, getPoolQuestion, createAssessmentFromPool } from '../services/assessmentPoolService.js';
import logger from '../utils/logger.js';

/**
 * GET /api/standard-assessment/pool
 * Browse the question pool library with filters.
 */
export const getPool = asyncHandler(async (req, res) => {
  const {
    subjectId, gradeLevel, standards, questionType,
    difficulty, language, search, page, limit,
  } = req.query;

  const standardIds = standards
    ? (Array.isArray(standards) ? standards : standards.split(','))
    : [];

  const result = await browsePool({
    schoolId: req.schoolId,
    userId: req.user._id,
    subjectId,
    gradeLevel,
    standardIds,
    questionType,
    difficulty,
    language,
    search,
    page: page || 1,
    limit: limit || 25,
  });

  return res.json({ success: true, data: result });
});

/**
 * GET /api/standard-assessment/pool/:poolId/questions/:questionId
 * Get a single pool question for preview.
 */
export const getPoolQuestionDetail = asyncHandler(async (req, res) => {
  const { poolId, questionId } = req.params;

  const question = await getPoolQuestion(req.schoolId, poolId, questionId);
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found.' });
  }

  return res.json({ success: true, data: question });
});

/**
 * POST /api/standard-assessment/from-pool
 * Create a new assessment draft from selected pool questions.
 */
export const createFromPool = asyncHandler(async (req, res) => {
  const {
    selectedPoolQuestionIds, subjectId, gradeLevel,
    classId, title, dueDate, instructions,
  } = req.body;

  if (!selectedPoolQuestionIds || !Array.isArray(selectedPoolQuestionIds) || selectedPoolQuestionIds.length === 0) {
    return res.status(400).json({ success: false, message: 'selectedPoolQuestionIds is required.' });
  }
  if (!classId) {
    return res.status(400).json({ success: false, message: 'classId is required.' });
  }

  const result = await createAssessmentFromPool({
    schoolId: req.schoolId,
    userId: req.user._id,
    selectedPoolQuestionIds,
    subjectId,
    gradeLevel,
    classId,
    title,
    dueDate,
    instructions,
    ipAddress: req.ip,
  });

  return res.status(201).json({ success: true, data: result });
});
