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

// Read — restricted to authorized roles
router.get('/', authorize('admin', 'teacher', 'department_principal'), getReportCards);
router.get('/:id', authorize('admin', 'teacher', 'department_principal', 'parent'), getReportCard);

// Write — admin or teachers with permission
router.post('/generate', authorize('teacher', 'admin'), generateReportCard);
router.post('/generate-bulk', authorize('admin'), generateBulkReportCards);
router.patch('/:id/publish', authorize('admin'), publishReportCard);
router.patch('/:id/comments', authorize('teacher', 'admin'), updateComments);

export default router;
