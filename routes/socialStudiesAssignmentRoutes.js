import express from 'express';
import {
    getAssignments, getAssignment, getAssignmentsForStudent,
    createAssignment, updateAssignment, publishAssignment,
    closeAssignment, deleteAssignment, getAssignmentResults,
} from '../controllers/socialStudiesAssignmentController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('socialStudies'));

router.get('/student', authorize('student'), getAssignmentsForStudent);

router.route('/')
    .get(authorize('admin', 'teacher', 'department_principal'), getAssignments)
    .post(authorize('admin', 'teacher'), createAssignment);

router.route('/:id')
    .get(authorize('admin', 'teacher', 'department_principal', 'student'), getAssignment)
    .put(authorize('admin', 'teacher'), updateAssignment)
    .delete(authorize('admin', 'teacher'), deleteAssignment);

router.post('/:id/publish', authorize('admin', 'teacher'), publishAssignment);
router.patch('/:id/close', authorize('admin', 'teacher'), closeAssignment);
router.get('/:id/results', authorize('admin', 'teacher', 'department_principal'), getAssignmentResults);

export default router;
