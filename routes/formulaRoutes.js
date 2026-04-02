import express from 'express';
import {
    getFormulas,
    getFormula,
    createFormula,
    updateFormula,
    deleteFormula,
    calculateFormula,
    getPresets
} from '../controllers/formulaController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

router.get('/presets', getPresets);
router.get('/', getFormulas);
router.get('/:id', getFormula);
router.post('/', authorize('teacher', 'admin'), createFormula);
router.put('/:id', authorize('teacher', 'admin'), updateFormula);
router.delete('/:id', authorize('teacher', 'admin'), deleteFormula);
router.post('/:id/calculate', calculateFormula);

export default router;
