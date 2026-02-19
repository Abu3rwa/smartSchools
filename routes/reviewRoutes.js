import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getMyReviewQueue,
  startMyReviewTask,
  completeMyReviewTask,
} from '../controllers/reviewQueueController.js';

const router = express.Router();

router.use(protect);

router.get('/queue', authorize('student'), getMyReviewQueue);
router.post('/task/:taskId/start', authorize('student'), startMyReviewTask);
router.post('/task/:taskId/complete', authorize('student'), completeMyReviewTask);

export default router;
