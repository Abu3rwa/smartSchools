import express from 'express';
import { protect, authorizeWithPermission } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { PERMISSIONS } from '../config/permissions.js';
import {
    getScales,
    createScale,
    updateScale,
    deleteScale,
    setDefaultScale
} from '../controllers/sbrConfigController.js';
import {
    generateSBR,
    generateBulkSBR,
    previewSBR,
    getReportCards,
    getReportCard,
    downloadReportCardPdf,
    publishReportCard,
    emailReportCard,
    deleteReportCard
} from '../controllers/sbrController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// Scale config routes (admin only)
router.get('/scales', authorizeWithPermission(['admin'], [PERMISSIONS.MANAGE_SBR_SCALES]), getScales);
router.post('/scales', authorizeWithPermission(['admin'], [PERMISSIONS.MANAGE_SBR_SCALES]), createScale);
router.put('/scales/:id', authorizeWithPermission(['admin'], [PERMISSIONS.MANAGE_SBR_SCALES]), updateScale);
router.delete('/scales/:id', authorizeWithPermission(['admin'], [PERMISSIONS.MANAGE_SBR_SCALES]), deleteScale);
router.post('/scales/:id/default', authorizeWithPermission(['admin'], [PERMISSIONS.MANAGE_SBR_SCALES]), setDefaultScale);

// Generation routes (teacher + admin)
router.post('/generate', authorizeWithPermission(['admin', 'teacher'], [PERMISSIONS.GENERATE_SBR_REPORTS]), generateSBR);
router.post('/generate-bulk', authorizeWithPermission(['admin', 'teacher'], [PERMISSIONS.GENERATE_SBR_REPORTS]), generateBulkSBR);
router.get('/preview/:studentId', authorizeWithPermission(['admin', 'teacher'], [PERMISSIONS.GENERATE_SBR_REPORTS]), previewSBR);

// Report access routes
router.get('/reports', authorizeWithPermission(['admin', 'teacher', 'parent'], [PERMISSIONS.VIEW_SBR_REPORTS]), getReportCards);
router.get('/reports/:id', authorizeWithPermission(['admin', 'teacher', 'parent'], [PERMISSIONS.VIEW_SBR_REPORTS]), getReportCard);
router.get('/reports/:id/pdf', authorizeWithPermission(['admin', 'teacher', 'parent'], [PERMISSIONS.VIEW_SBR_REPORTS]), downloadReportCardPdf);
router.post('/reports/:id/publish', authorizeWithPermission(['admin', 'teacher'], [PERMISSIONS.GENERATE_SBR_REPORTS]), publishReportCard);
router.post('/reports/:id/email', authorizeWithPermission(['admin', 'teacher'], [PERMISSIONS.GENERATE_SBR_REPORTS]), emailReportCard);
router.delete('/reports/:id', authorizeWithPermission(['admin', 'teacher'], [PERMISSIONS.GENERATE_SBR_REPORTS]), deleteReportCard);

export default router;
