import { asyncHandler } from '../middleware/errorHandler.js';
import {
  getTeacherInterventionQueue,
  acknowledgeCase,
  resolveCase,
  dismissCase,
} from '../services/interventionQueueService.js';
import {
  interventionQueueQuerySchema,
  interventionActionBodySchema,
} from '../schemas/reviewSchemas.js';

const INTERVENTION_QUEUE_ENABLED = () => process.env.INTERVENTION_QUEUE_ENABLED !== 'false';

export const getInterventionQueue = asyncHandler(async (req, res) => {
  if (!INTERVENTION_QUEUE_ENABLED()) {
    return res.json({
      success: true,
      data: {
        items: [],
        pagination: { page: 1, limit: 0, total: 0, pages: 0 },
        featureEnabled: false,
      },
    });
  }

  const parsedQuery = interventionQueueQuerySchema.safeParse(req.query || {});
  if (!parsedQuery.success) {
    return res.status(400).json({ success: false, message: 'Invalid query parameters' });
  }

  const result = await getTeacherInterventionQueue({
    schoolId: req.schoolId,
    classId: parsedQuery.data.classId,
    subjectId: parsedQuery.data.subjectId,
    riskLevel: parsedQuery.data.riskLevel,
    status: parsedQuery.data.status || 'open',
    page: parsedQuery.data.page || 1,
    limit: parsedQuery.data.limit || 20,
  });

  res.json({ success: true, data: { ...result, featureEnabled: true } });
});

export const acknowledgeInterventionCase = asyncHandler(async (req, res) => {
  if (!INTERVENTION_QUEUE_ENABLED()) {
    return res.status(404).json({ success: false, message: 'Intervention queue feature is disabled' });
  }

  const item = await acknowledgeCase({ caseId: req.params.caseId, userId: req.user._id });
  if (!item) {
    return res.status(404).json({ success: false, message: 'Intervention case not found' });
  }

  res.json({ success: true, data: item });
});

export const resolveInterventionCase = asyncHandler(async (req, res) => {
  if (!INTERVENTION_QUEUE_ENABLED()) {
    return res.status(404).json({ success: false, message: 'Intervention queue feature is disabled' });
  }

  const parsedBody = interventionActionBodySchema.safeParse(req.body || {});
  if (!parsedBody.success) {
    return res.status(400).json({ success: false, message: 'Invalid request payload' });
  }

  const item = await resolveCase({
    caseId: req.params.caseId,
    userId: req.user._id,
    resolutionNote: parsedBody.data.note,
  });
  if (!item) {
    return res.status(404).json({ success: false, message: 'Intervention case not found' });
  }

  res.json({ success: true, data: item });
});

export const dismissInterventionCase = asyncHandler(async (req, res) => {
  if (!INTERVENTION_QUEUE_ENABLED()) {
    return res.status(404).json({ success: false, message: 'Intervention queue feature is disabled' });
  }

  const parsedBody = interventionActionBodySchema.safeParse(req.body || {});
  if (!parsedBody.success) {
    return res.status(400).json({ success: false, message: 'Invalid request payload' });
  }

  const item = await dismissCase({
    caseId: req.params.caseId,
    userId: req.user._id,
    note: parsedBody.data.note,
  });
  if (!item) {
    return res.status(404).json({ success: false, message: 'Intervention case not found' });
  }

  res.json({ success: true, data: item });
});
