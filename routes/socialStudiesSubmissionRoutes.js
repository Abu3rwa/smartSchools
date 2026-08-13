import express from 'express';
import {
    startSubmission, submitSubmission, getMySubmissions, getSubmission, gradeSubmission,
} from '../controllers/socialStudiesSubmissionController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('socialStudies'));

router.post('/start', authorize('student'), startSubmission);
router.get('/my', authorize('student'), getMySubmissions);
router.get('/:id', authorize('student', 'teacher', 'admin', 'department_principal'), getSubmission);
router.put('/:id/submit', authorize('student'), submitSubmission);
router.put('/:id/grade', authorize('admin', 'teacher'), gradeSubmission);

export default router;
