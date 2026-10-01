import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { getStorageStats, cleanStorage } from '../controllers/systemStorageController.js';

const router = express.Router();

// Require authenticated admin or super_admin
router.use(protect);
router.use(authorize('admin', 'super_admin'));

/**
 * @route   GET /api/system/storage/stats
 * @desc    Get detailed MongoDB Atlas cluster storage statistics and cleanable item breakdown
 */
router.get('/stats', getStorageStats);

/**
 * @route   POST /api/system/storage/clean
 * @desc    Clean unneeded telemetry, sent email logs, and old notifications
 */
router.post('/clean', cleanStorage);

export default router;
