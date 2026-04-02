import express from 'express';
import {
    getTemplates,
    getTemplate,
    createTemplate,
    createTemplateFromClass,
    updateTemplate,
    deleteTemplate,
    applyTemplate
} from '../controllers/templateController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/', getTemplates);
router.get('/:id', getTemplate);
router.post('/', authorize('teacher', 'admin'), createTemplate);
router.post('/from-class', authorize('teacher', 'admin'), createTemplateFromClass);
router.put('/:id', authorize('teacher', 'admin'), updateTemplate);
router.delete('/:id', authorize('teacher', 'admin'), deleteTemplate);
router.post('/:id/apply', authorize('teacher', 'admin'), applyTemplate);

export default router;
