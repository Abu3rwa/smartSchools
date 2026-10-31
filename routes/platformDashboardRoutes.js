import express from 'express';
import { getPlatformDashboard } from '../controllers/platformDashboardController.js';
import { protect } from '../middleware/auth.js';
import { superAdminOnly } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(superAdminOnly);

router.get('/', getPlatformDashboard);

export default router;
