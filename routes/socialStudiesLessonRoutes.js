import express from 'express';
import {
    getLessons, getLesson, getLessonForStudent, createLesson, updateLesson, deleteLesson,
    generateQuestionsFromLesson,
} from '../controllers/socialStudiesLessonController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(requireFeature('socialStudies'));

router.route('/')
    .get(authorize('admin', 'teacher', 'department_principal'), getLessons)
    .post(authorize('admin', 'teacher'), createLesson);

router.get('/student/list', authorize('student'), getLessons);             // student lesson list (published only handled by controller)
router.get('/:id/student', authorize('student', 'parent'), getLessonForStudent);

router.route('/:id')
    .get(authorize('admin', 'teacher', 'department_principal'), getLesson)
    .put(authorize('admin', 'teacher'), updateLesson)
    .delete(authorize('admin', 'teacher'), deleteLesson);

router.post('/:id/generate-questions', authorize('admin', 'teacher'), generateQuestionsFromLesson);

export default router;
