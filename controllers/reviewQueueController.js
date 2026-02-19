import { asyncHandler } from '../middleware/errorHandler.js';
import Student from '../models/Student.js';
import {
  getStudentReviewQueue,
  startReviewTask,
  completeReviewTask,
} from '../services/reviewSchedulerService.js';
import {
  completeReviewTaskBodySchema,
  reviewQueueQuerySchema,
} from '../schemas/reviewSchemas.js';

const REVIEW_QUEUE_ENABLED = () => process.env.REVIEW_QUEUE_ENABLED !== 'false';

const getStudentFromUser = async (userId) => Student.findOne({ user: userId, status: 'active' });

export const getMyReviewQueue = asyncHandler(async (req, res) => {
  if (!REVIEW_QUEUE_ENABLED()) {
    return res.json({ success: true, data: { items: [], featureEnabled: false } });
  }

  const parsedQuery = reviewQueueQuerySchema.safeParse(req.query || {});
  if (!parsedQuery.success) {
    return res.status(400).json({ success: false, message: 'Invalid query parameters' });
  }

  const student = await getStudentFromUser(req.user._id);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const items = await getStudentReviewQueue({
    studentId: student._id,
    limit: parsedQuery.data.limit ?? 20,
    now: new Date(),
  });

  res.json({ success: true, data: { items, featureEnabled: true } });
});

export const startMyReviewTask = asyncHandler(async (req, res) => {
  if (!REVIEW_QUEUE_ENABLED()) {
    return res.status(404).json({ success: false, message: 'Review queue feature is disabled' });
  }

  const student = await getStudentFromUser(req.user._id);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const task = await startReviewTask({ taskId: req.params.taskId, studentId: student._id });
  if (!task) {
    return res.status(404).json({ success: false, message: 'Review task not found or not available to start' });
  }

  res.json({ success: true, data: task });
});

export const completeMyReviewTask = asyncHandler(async (req, res) => {
  if (!REVIEW_QUEUE_ENABLED()) {
    return res.status(404).json({ success: false, message: 'Review queue feature is disabled' });
  }

  const parsedBody = completeReviewTaskBodySchema.safeParse(req.body || {});
  if (!parsedBody.success) {
    return res.status(400).json({ success: false, message: 'Invalid completion payload' });
  }

  const student = await getStudentFromUser(req.user._id);
  if (!student) {
    return res.status(404).json({ success: false, message: 'Student profile not found' });
  }

  const task = await completeReviewTask({
    taskId: req.params.taskId,
    studentId: student._id,
    outcome: parsedBody.data,
  });

  if (!task) {
    return res.status(404).json({ success: false, message: 'Review task not found or not available to complete' });
  }

  res.json({ success: true, data: task });
});
