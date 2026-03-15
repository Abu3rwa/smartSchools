import express from 'express';
import {
    createAssessmentReflectionController,
    getAssessmentObjectiveAnalysisController,
    getAssessmentReflectionController,
    updateAssessmentReflectionController
} from '../controllers/academicIntelligenceController.js';
import { authorize, protect, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('academicIntelligence'));

router.get('/:id/objective-analysis', authorize('admin', 'department_principal', 'teacher'), getAssessmentObjectiveAnalysisController);
router.post('/:id/reflection', authorize('admin', 'teacher'), createAssessmentReflectionController);
router.get('/:id/reflection', authorize('admin', 'department_principal', 'teacher'), getAssessmentReflectionController);
router.patch('/:id/reflection', authorize('admin', 'teacher'), updateAssessmentReflectionController);

export default router;