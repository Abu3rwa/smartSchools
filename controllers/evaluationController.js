import LessonPlan from '../models/LessonPlan.js';
import Class from '../models/Class.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  evaluateLessonPlanForAdmin,
  getCurrentCriteriaHashForSchool
} from '../services/lessonPlanEvaluationService.js';

const ensureLessonAccess = async ({ lessonId, schoolId, departmentId }) => {
  const lesson = await LessonPlan.findById(lessonId)
    .select('school class aiEvaluation aiEvaluationMeta aiEvaluationHistory status evaluatedAt title')
    .lean();

  if (!lesson) {
    const error = new Error('Lesson plan not found');
    error.statusCode = 404;
    throw error;
  }

  if (lesson.school?.toString() !== schoolId.toString()) {
    const error = new Error('Access denied');
    error.statusCode = 403;
    throw error;
  }

  if (departmentId) {
    const lessonClass = await Class.findById(lesson.class).select('department').lean();
    if (!lessonClass?.department || lessonClass.department.toString() !== departmentId.toString()) {
      const error = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }
  }

  return lesson;
};

const getHistoryEntries = (lesson) => {
  const explicitHistory = Array.isArray(lesson.aiEvaluationHistory) ? lesson.aiEvaluationHistory : [];
  if (explicitHistory.length > 0) {
    return explicitHistory
      .slice()
      .sort((a, b) => new Date(b.evaluatedAt || 0).getTime() - new Date(a.evaluatedAt || 0).getTime());
  }

  if (lesson.aiEvaluation?.evaluatedAt) {
    return [{
      evaluationId: `legacy-${lesson._id.toString()}`,
      evaluatedAt: lesson.aiEvaluation.evaluatedAt,
      overallScore: lesson.aiEvaluation.overallScore,
      meetsMinimumRequirements: lesson.aiEvaluation.meetsMinimumRequirements,
      criteriaScores: lesson.aiEvaluation.criteriaScores || [],
      strengths: lesson.aiEvaluation.strengths || [],
      areasForImprovement: lesson.aiEvaluation.areasForImprovement || [],
      recommendations: lesson.aiEvaluation.recommendations || [],
      meta: lesson.aiEvaluationMeta || {}
    }];
  }

  return [];
};

/**
 * @desc    Admin trigger AI lesson plan evaluation
 * @route   POST /api/lessons/:id/evaluation/trigger
 * @access  Private (Admin, Department Principal)
 */
export const triggerEvaluation = asyncHandler(async (req, res) => {
  const { forceReevaluate = false, reason = '' } = req.body || {};

  await ensureLessonAccess({
    lessonId: req.params.id,
    schoolId: req.schoolId,
    departmentId: req.departmentId
  });

  const result = await evaluateLessonPlanForAdmin({
    lessonPlanId: req.params.id,
    schoolId: req.schoolId,
    actorUserId: req.user?._id,
    forceReevaluate: forceReevaluate === true,
    reason
  });

  res.json({
    success: true,
    message: result.cached
      ? 'Returned cached evaluation (lesson content and criteria unchanged)'
      : 'Lesson plan evaluated successfully',
    data: {
      lesson: result.lesson,
      evaluation: result.evaluation,
      cached: result.cached
    }
  });
});

/**
 * @desc    Get lesson plan AI evaluation history
 * @route   GET /api/lessons/:id/evaluation/history
 * @access  Private (Admin, Department Principal)
 */
export const getEvaluationHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));

  const lesson = await ensureLessonAccess({
    lessonId: req.params.id,
    schoolId: req.schoolId,
    departmentId: req.departmentId
  });

  const historyEntries = getHistoryEntries(lesson);
  const total = historyEntries.length;
  const startIndex = (page - 1) * limit;
  const paginated = historyEntries.slice(startIndex, startIndex + limit);

  const currentCriteriaState = await getCurrentCriteriaHashForSchool(req.schoolId);
  const storedCriteriaHash = lesson.aiEvaluationMeta?.criteriaHash || null;
  const isStaleComparedToCurrentCriteria = Boolean(
    storedCriteriaHash
    && currentCriteriaState.criteriaHash
    && storedCriteriaHash !== currentCriteriaState.criteriaHash
  );

  res.json({
    success: true,
    data: {
      lessonId: lesson._id,
      lessonTitle: lesson.title,
      currentEvaluation: lesson.aiEvaluation || null,
      currentEvaluationMeta: lesson.aiEvaluationMeta || null,
      isStaleComparedToCurrentCriteria,
      currentCriteriaHash: currentCriteriaState.criteriaHash,
      currentCriteriaCount: currentCriteriaState.criteriaCount,
      history: paginated,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});
