import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext, superAdminOnly } from '../middleware/tenantIsolation.js';
import {
    previewImport,
    commitImport,
    listImportRuns,
    downloadImportErrorReport
} from '../controllers/importController.js';
import {
    listImportTemplateEntities,
    listImportTemplatesAdmin,
    createImportTemplateAdmin,
    updateImportTemplateAdmin,
    setImportTemplateStatusAdmin,
    deleteImportTemplateAdmin,
    downloadImportTemplateAdmin,
    getEntityTemplateMetadata,
    downloadEntityTemplate
} from '../controllers/importTemplateController.js';
import uploadImportTemplate from '../middleware/uploadImportTemplate.js';

const router = express.Router();

router.use(protect);

// Super admin template management (global scope)
router.get('/templates/admin', superAdminOnly, listImportTemplatesAdmin);
router.post('/templates/admin', superAdminOnly, uploadImportTemplate.single('file'), createImportTemplateAdmin);
router.put('/templates/admin/:id', superAdminOnly, uploadImportTemplate.single('file'), updateImportTemplateAdmin);
router.patch('/templates/admin/:id/status', superAdminOnly, setImportTemplateStatusAdmin);
router.delete('/templates/admin/:id', superAdminOnly, deleteImportTemplateAdmin);
router.get('/templates/admin/:id/download', superAdminOnly, downloadImportTemplateAdmin);

// School users can read active templates and fallback samples
router.get('/templates/entities', requireSchoolContext, authorize('admin', 'department_principal'), listImportTemplateEntities);
router.get('/templates/:entityType', requireSchoolContext, authorize('admin', 'department_principal'), getEntityTemplateMetadata);
router.get('/templates/:entityType/download', requireSchoolContext, authorize('admin', 'department_principal'), downloadEntityTemplate);

router.use(requireSchoolContext);
router.use(authorize('admin', 'department_principal'));

router.get('/runs', listImportRuns);
router.get('/runs/:id/error-report', downloadImportErrorReport);
router.post('/:entityType/preview', previewImport);
router.post('/:entityType/commit', commitImport);

export default router;
