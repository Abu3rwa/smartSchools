import express from 'express';
import {
    generateReportCard,
    generateBulkReportCards,
    getReportCards,
    getReportCard,
    publishReportCard,
    updateComments
} from '../controllers/reportCardController.js';
import { protect, authorize, requirePermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Read — any authenticated user
router.get('/', getReportCards);
router.get('/:id', getReportCard);

// Write — admin or teachers with permission
router.post('/generate', authorize('teacher', 'admin'), generateReportCard);
router.post('/generate-bulk', authorize('admin'), generateBulkReportCards);
router.patch('/:id/publish', authorize('admin'), publishReportCard);
router.patch('/:id/comments', authorize('teacher', 'admin'), updateComments);

export default router;
