import express from 'express';
import {
    getClasses,
    getClass,
    createClass,
    updateClass,
    deleteClass,
    addSubjectToClass,
    removeSubjectFromClass,
    getClassStats
} from '../controllers/classManagementController.js';
import { getClassAnalytics, getClassInsights } from '../controllers/classAnalyticsController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

router.route('/')
    .get(authorize('admin', 'department_principal', 'teacher'), getClasses)
    .post(authorize('admin'), validationRules.createClass, validate, createClass);

router.get('/:id/analytics', authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getClassAnalytics);
router.get('/:id/insights', authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getClassInsights);

router.route('/:id')
    .get(authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getClass)
    .put(authorize('admin', 'department_principal'), validationRules.mongoId, validate, updateClass)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteClass);

router.post('/:id/subjects', authorize('admin'), validationRules.mongoId, validate, addSubjectToClass);
router.delete('/:id/subjects/:subjectId', authorize('admin'), removeSubjectFromClass);
router.get('/:id/stats', authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getClassStats);

export default router;
