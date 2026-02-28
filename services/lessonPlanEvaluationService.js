import { createHash } from 'crypto';
import LessonPlan from '../models/LessonPlan.js';
import LessonPlanCriteria from '../models/LessonPlanCriteria.js';
import { AITokenUsage } from '../models/AITokenUsage.js';
import aiService from './aiservice.js';

const MODEL_NAME = 'gemini-2.5-flash-lite';
const PROMPT_VERSION = 'lesson-plan-evaluation-v2';
const MAX_HISTORY_ENTRIES = 20;

const TRIGGER_SOURCES = {
  TEACHER_SUBMIT: 'teacher_submit',
  ADMIN_MANUAL: 'admin_manual',
  SYSTEM_RECHECK: 'system_recheck'
};

const normalizeText = (value) => String(value || '').trim();
const normalizeName = (value) => normalizeText(value).toLowerCase();

const createSha256 = (payload) => createHash('sha256').update(payload).digest('hex');

export const buildCriteriaSnapshot = (criteriaDocs = []) => criteriaDocs.map((criterion) => ({
  criteriaId: String(criterion._id || criterion.criteriaId || ''),
  name: normalizeText(criterion.name),
  description: normalizeText(criterion.description),
  weight: Number(criterion.weight || 1),
  minScore: Number(criterion.minScore || 0),
  isRequired: Boolean(criterion.isRequired),
  evaluationPrompt: normalizeText(criterion.evaluationPrompt),
  updatedAt: criterion.updatedAt ? new Date(criterion.updatedAt).toISOString() : null
}));

export const buildCriteriaHash = (criteriaSnapshot = []) => createSha256(JSON.stringify(criteriaSnapshot));

export const buildLessonSnapshot = (lessonPlan) => ({
  title: normalizeText(lessonPlan.title),
  topic: normalizeText(lessonPlan.topic),
  subject: normalizeText(lessonPlan.subject?.name),
  className: normalizeText(lessonPlan.class?.name),
  classGrade: normalizeText(lessonPlan.class?.grade),
  date: lessonPlan.date ? new Date(lessonPlan.date).toISOString() : null,
  summary: normalizeText(lessonPlan.summary),
  description: normalizeText(lessonPlan.description),
  learningObjectives: normalizeText(lessonPlan.learningObjectives || lessonPlan.teachingObjectives),
  teachingObjectives: normalizeText(lessonPlan.teachingObjectives),
  activities: normalizeText(lessonPlan.activities),
  assessmentMethods: normalizeText(lessonPlan.assessmentMethods),
  resources: normalizeText(lessonPlan.resources),
  differentiation: normalizeText(lessonPlan.differentiation),
  previousKnowledge: normalizeText(lessonPlan.previousKnowledge),
  vocabulary: normalizeText(lessonPlan.vocabulary),
  techIntegration: normalizeText(lessonPlan.techIntegration),
  homework: normalizeText(lessonPlan.homework),
  stages: Array.isArray(lessonPlan.stages)
    ? lessonPlan.stages.map((stage) => ({
      name: normalizeText(stage?.name),
      procedure: normalizeText(stage?.procedure),
      materials: normalizeText(stage?.materials),
      timing: normalizeText(stage?.timing)
    }))
    : []
});

export const buildLessonHash = (lessonSnapshot) => createSha256(JSON.stringify(lessonSnapshot));

export const getCurrentCriteriaHashForSchool = async (schoolId) => {
  const criteriaDocs = await LessonPlanCriteria.find({
    school: schoolId,
    isActive: true
  }).sort({ order: 1 });

  const criteriaSnapshot = buildCriteriaSnapshot(criteriaDocs);
  return {
    criteriaHash: buildCriteriaHash(criteriaSnapshot),
    criteriaCount: criteriaSnapshot.length,
    criteriaSnapshot
  };
};

const formatStages = (stages) => {
  if (!Array.isArray(stages) || stages.length === 0) return '';
  return stages
    .map((stage, index) => `Stage ${index + 1}: ${stage.name || 'Unnamed'}\n${stage.procedure || 'No procedure specified'}\nTiming: ${stage.timing || 'Not specified'}`)
    .join('\n\n');
};

const formatStageMaterials = (stages) => {
  if (!Array.isArray(stages) || stages.length === 0) return '';
  return stages.map((stage) => stage.materials).filter(Boolean).join(', ');
};

const buildEvaluationPrompt = ({ lessonPlan, criteriaSnapshot }) => {
  const lessonContent = `
LESSON PLAN DETAILS:
- Topic: ${lessonPlan.topic || lessonPlan.title || 'Not specified'}
- Subject: ${lessonPlan.subject?.name || 'Not specified'}
- Grade/Class: ${lessonPlan.class?.name || 'Not specified'} (Grade ${lessonPlan.class?.grade || 'N/A'})
- Date: ${lessonPlan.date ? new Date(lessonPlan.date).toLocaleDateString() : 'Not specified'}

LEARNING OBJECTIVES:
${lessonPlan.learningObjectives || lessonPlan.teachingObjectives || 'Not specified'}

INSTRUCTIONAL ACTIVITIES:
${lessonPlan.activities || formatStages(lessonPlan.stages) || lessonPlan.description || 'Not specified'}

ASSESSMENT METHODS:
${lessonPlan.assessmentMethods || 'Not specified'}

RESOURCES AND MATERIALS:
${lessonPlan.resources || formatStageMaterials(lessonPlan.stages) || 'Not specified'}

DIFFERENTIATION STRATEGIES:
${lessonPlan.differentiation || 'Not specified'}

ADDITIONAL INFORMATION:
- Summary: ${lessonPlan.summary || 'Not specified'}
- Previous Knowledge: ${lessonPlan.previousKnowledge || 'Not specified'}
- Vocabulary: ${lessonPlan.vocabulary || 'Not specified'}
- Technology Integration: ${lessonPlan.techIntegration || 'Not specified'}
- Homework: ${lessonPlan.homework || 'Not specified'}
`.trim();

  const criteriaText = criteriaSnapshot.map((criterion, index) => `
${index + 1}. ${criterion.name} (Weight: ${criterion.weight}/5, Minimum Score: ${criterion.minScore}/100)
   Description: ${criterion.description || 'No description provided'}
   Evaluation Guidance: ${criterion.evaluationPrompt || 'Evaluate based on best practices'}
   Required: ${criterion.isRequired ? 'Yes' : 'No'}
`).join('\n');

  return `SYSTEM ROLE:
You are a senior instructional coach and pedagogical evaluator.
Evaluate lesson plans professionally, objectively, and constructively.
Use only the provided lesson content and criteria.
Do not invent missing details.

${lessonContent}

EVALUATION CRITERIA:
${criteriaText}

INSTRUCTIONS:
1. Evaluate the lesson plan against each criterion listed.
2. Provide a score from 0-100 for each criterion based on the evaluation guidance.
3. Provide specific, constructive feedback for each criterion.
4. Determine if each criterion meets its minimum score requirement.
5. Identify 2-4 key strengths.
6. Identify 2-4 areas for improvement.
7. Provide 2-4 actionable recommendations.

OUTPUT FORMAT - Return ONLY one valid JSON object in this shape:
{
  "criteriaScores": [
    {
      "criteriaName": "exact name from criteria list",
      "score": 0,
      "feedback": "specific constructive feedback",
      "metMinimum": true
    }
  ],
  "strengths": ["strength 1"],
  "areasForImprovement": ["area 1"],
  "recommendations": ["recommendation 1"],
  "overallScore": 0,
  "meetsMinimumRequirements": false
}

IMPORTANT:
- Return JSON only.
- Scores must be between 0 and 100.
- Feedback must be evidence-based and respectful.`;
};

const clampScore = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(100, Math.max(0, numericValue));
};

const normalizeStringArray = (value) => (
  Array.isArray(value)
    ? value
      .map((item) => normalizeText(item))
      .filter(Boolean)
      .slice(0, 5)
    : []
);

const parseEvaluation = (parsed, criteriaSnapshot) => {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid AI response payload');
  }

  const rawScores = Array.isArray(parsed.criteriaScores) ? parsed.criteriaScores : [];
  if (rawScores.length === 0) {
    throw new Error('AI response is missing criteriaScores');
  }

  const scoresByName = new Map();
  for (const scoreEntry of rawScores) {
    const key = normalizeName(scoreEntry?.criteriaName);
    if (key) scoresByName.set(key, scoreEntry);
  }

  const criteriaScores = criteriaSnapshot.map((criterion, index) => {
    const byName = scoresByName.get(normalizeName(criterion.name));
    const fallback = rawScores[index] || {};
    const selectedScore = byName || fallback;

    const score = clampScore(selectedScore?.score);
    const meetsMinimum = typeof selectedScore?.metMinimum === 'boolean'
      ? selectedScore.metMinimum
      : score >= criterion.minScore;

    return {
      criteriaId: criterion.criteriaId,
      criteriaName: criterion.name,
      score,
      feedback: normalizeText(selectedScore?.feedback) || 'No feedback provided',
      metMinimum: meetsMinimum
    };
  });

  const totalWeight = criteriaSnapshot.reduce((sum, criterion) => sum + Math.max(1, Number(criterion.weight || 1)), 0);
  const weightedTotal = criteriaScores.reduce((sum, scoreRow, index) => {
    const weight = Math.max(1, Number(criteriaSnapshot[index]?.weight || 1));
    return sum + (scoreRow.score * weight);
  }, 0);
  const overallScore = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;

  const meetsMinimumRequirements = criteriaScores.every((scoreRow, index) => {
    if (!criteriaSnapshot[index]?.isRequired) return true;
    return scoreRow.metMinimum;
  });

  return {
    criteriaScores,
    strengths: normalizeStringArray(parsed.strengths),
    areasForImprovement: normalizeStringArray(parsed.areasForImprovement),
    recommendations: normalizeStringArray(parsed.recommendations),
    overallScore,
    meetsMinimumRequirements
  };
};

const trackTokenUsage = async ({
  lessonPlan,
  actorUserId,
  tokenUsage,
  modelName,
  triggerSource,
  criteriaHash,
  lessonContentHash,
  criteriaCount,
  reason
}) => {
  if (!lessonPlan?.school || !actorUserId) return;

  await AITokenUsage.create({
    model: modelName || MODEL_NAME,
    feature: triggerSource === TRIGGER_SOURCES.ADMIN_MANUAL
      ? 'lesson_plan_admin_evaluation'
      : 'lesson_plan_evaluation',
    school: lessonPlan.school,
    schoolId: lessonPlan.school.toString(),
    user: actorUserId,
    entityType: 'lesson_plan',
    entityId: lessonPlan._id,
    promptVersion: PROMPT_VERSION,
    inputTokens: tokenUsage.input,
    outputTokens: tokenUsage.output,
    totalTokens: tokenUsage.total,
    metadata: {
      lessonPlanId: lessonPlan._id.toString(),
      criteriaHash,
      lessonContentHash,
      criteriaCount,
      triggerSource,
      reason: normalizeText(reason)
    }
  });
};

const evaluateLessonPlanCore = async ({
  lessonPlanId,
  criteriaDocs,
  schoolId,
  actorUserId,
  forceReevaluate = false,
  reason = '',
  triggerSource = TRIGGER_SOURCES.TEACHER_SUBMIT
}) => {
  const lessonPlan = await LessonPlan.findById(lessonPlanId)
    .populate('class', 'name grade department')
    .populate('subject', 'name')
    .populate('teacher', 'firstName lastName email');

  if (!lessonPlan) {
    const error = new Error('Lesson plan not found');
    error.statusCode = 404;
    throw error;
  }

  const effectiveSchoolId = schoolId || lessonPlan.school;
  if (effectiveSchoolId && lessonPlan.school?.toString() !== effectiveSchoolId.toString()) {
    const error = new Error('Lesson plan is not in the requested school context');
    error.statusCode = 403;
    throw error;
  }

  const resolvedCriteria = Array.isArray(criteriaDocs) && criteriaDocs.length > 0
    ? criteriaDocs
    : await LessonPlanCriteria.find({ school: effectiveSchoolId, isActive: true }).sort({ order: 1 });

  if (!resolvedCriteria || resolvedCriteria.length === 0) {
    const error = new Error('No active lesson plan criteria configured for this school');
    error.statusCode = 400;
    throw error;
  }

  const criteriaSnapshot = buildCriteriaSnapshot(resolvedCriteria);
  const criteriaHash = buildCriteriaHash(criteriaSnapshot);
  const lessonSnapshot = buildLessonSnapshot(lessonPlan);
  const lessonContentHash = buildLessonHash(lessonSnapshot);

  const existingMeta = lessonPlan.aiEvaluationMeta || {};
  const hasCachedMatch = Boolean(
    lessonPlan.aiEvaluation?.evaluatedAt
    && existingMeta.criteriaHash === criteriaHash
    && existingMeta.lessonContentHash === lessonContentHash
  );

  if (hasCachedMatch && !forceReevaluate) {
    return {
      evaluation: lessonPlan.aiEvaluation,
      cached: true,
      lesson: lessonPlan,
      history: lessonPlan.aiEvaluationHistory || []
    };
  }

  const startedAt = Date.now();
  lessonPlan.aiEvaluationStatus = 'in_progress';
  lessonPlan.aiEvaluationRequestedAt = new Date();
  lessonPlan.aiEvaluationLastError = '';
  await lessonPlan.save();

  try {
    const prompt = buildEvaluationPrompt({ lessonPlan, criteriaSnapshot });
    const aiResult = await aiService.generateStructuredJson({
      prompt,
      modelName: MODEL_NAME,
      maxRetries: 1
    });

    const evaluation = parseEvaluation(aiResult.parsed, criteriaSnapshot);
    const evaluatedAt = new Date();
    const latencyMs = Date.now() - startedAt;

    lessonPlan.aiEvaluation = {
      overallScore: evaluation.overallScore,
      criteriaScores: evaluation.criteriaScores,
      strengths: evaluation.strengths,
      areasForImprovement: evaluation.areasForImprovement,
      recommendations: evaluation.recommendations,
      meetsMinimumRequirements: evaluation.meetsMinimumRequirements,
      evaluatedBy: 'AI',
      evaluatedAt
    };

    lessonPlan.aiEvaluationMeta = {
      criteriaHash,
      lessonContentHash,
      criteriaCount: criteriaSnapshot.length,
      criteriaSnapshot,
      promptVersion: PROMPT_VERSION,
      model: aiResult.modelName || MODEL_NAME,
      triggeredBy: actorUserId || lessonPlan.teacher?._id || lessonPlan.teacher,
      triggerSource,
      latencyMs
    };

    const historyEntry = {
      evaluationId: `${lessonPlan._id.toString()}-${evaluatedAt.getTime()}`,
      evaluatedAt,
      overallScore: evaluation.overallScore,
      meetsMinimumRequirements: evaluation.meetsMinimumRequirements,
      criteriaScores: evaluation.criteriaScores,
      strengths: evaluation.strengths,
      areasForImprovement: evaluation.areasForImprovement,
      recommendations: evaluation.recommendations,
      meta: {
        criteriaHash,
        lessonContentHash,
        criteriaCount: criteriaSnapshot.length,
        promptVersion: PROMPT_VERSION,
        model: aiResult.modelName || MODEL_NAME,
        triggerSource,
        triggeredBy: actorUserId || lessonPlan.teacher?._id || lessonPlan.teacher,
        reason: normalizeText(reason),
        latencyMs
      }
    };

    const existingHistory = Array.isArray(lessonPlan.aiEvaluationHistory)
      ? lessonPlan.aiEvaluationHistory
      : [];
    lessonPlan.aiEvaluationHistory = [historyEntry, ...existingHistory].slice(0, MAX_HISTORY_ENTRIES);

    if (evaluation.meetsMinimumRequirements) {
      lessonPlan.status = 'approved';
    } else {
      lessonPlan.status = 'needs_revision';
    }

    lessonPlan.aiEvaluationStatus = 'completed';
    lessonPlan.aiEvaluationCompletedAt = evaluatedAt;
    lessonPlan.aiEvaluationLastError = '';
    lessonPlan.evaluatedAt = evaluatedAt;

    await lessonPlan.save();

    await trackTokenUsage({
      lessonPlan,
      actorUserId: actorUserId || lessonPlan.teacher?._id || lessonPlan.teacher,
      tokenUsage: aiResult.tokenUsage,
      modelName: aiResult.modelName,
      triggerSource,
      criteriaHash,
      lessonContentHash,
      criteriaCount: criteriaSnapshot.length,
      reason
    });

    return {
      evaluation: lessonPlan.aiEvaluation,
      cached: false,
      lesson: lessonPlan,
      history: lessonPlan.aiEvaluationHistory || []
    };
  } catch (error) {
    lessonPlan.aiEvaluationStatus = 'failed';
    lessonPlan.aiEvaluationCompletedAt = new Date();
    lessonPlan.aiEvaluationLastError = error.message;
    await lessonPlan.save();

    const wrappedError = new Error(`Failed to evaluate lesson plan: ${error.message}`);
    wrappedError.statusCode = error.statusCode || 500;
    throw wrappedError;
  }
};

export const evaluateLessonPlan = async (lessonPlanId, criteria = [], options = {}) => {
  const actorUserId = options.actorUserId || null;
  const forceReevaluate = options.forceReevaluate === true;
  const reason = options.reason || '';
  const triggerSource = options.triggerSource || TRIGGER_SOURCES.TEACHER_SUBMIT;

  return evaluateLessonPlanCore({
    lessonPlanId,
    criteriaDocs: criteria,
    actorUserId,
    forceReevaluate,
    reason,
    triggerSource
  });
};

export const evaluateLessonPlanForAdmin = async ({
  lessonPlanId,
  schoolId,
  actorUserId,
  forceReevaluate = false,
  reason = ''
}) => evaluateLessonPlanCore({
  lessonPlanId,
  schoolId,
  actorUserId,
  forceReevaluate,
  reason,
  triggerSource: TRIGGER_SOURCES.ADMIN_MANUAL
});

export const LESSON_PLAN_EVALUATION_SOURCES = TRIGGER_SOURCES;
