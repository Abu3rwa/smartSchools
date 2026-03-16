import express from 'express';
import {
    getClasses,
    getClass,
    createClass,
    importClasses,
    updateClass,
    deleteClass,
    addSubjectToClass,
    removeSubjectFromClass,
    getClassStats
} from '../controllers/classManagementController.js';
import { getClassAnalytics, getClassInsights } from '../controllers/classAnalyticsController.js';
import { getClassObjectivePerformanceController } from '../controllers/academicIntelligenceController.js';
import {
    getClassAcademicExcellenceSummary,
    getClassAcademicExcellenceObjectives
} from '../controllers/academicExcellenceTeacherController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireFeature } from '../middleware/featureGate.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';
import { requireLimit } from '../middleware/checkUsageLimit.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

router.route('/')
    .get(authorize('admin', 'department_principal', 'teacher'), getClasses)
    .post(authorize('admin'), requireLimit('classes'), validationRules.createClass, validate, createClass);

router.post('/import', authorize('admin', 'department_principal'), importClasses);

router.get('/:id/analytics', authorize('admin', 'department_principal', 'teacher'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getClassAnalytics);
router.get('/:id/insights', authorize('admin', 'department_principal', 'teacher'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getClassInsights);
router.get('/:id/objective-performance', authorize('admin', 'department_principal', 'teacher'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getClassObjectivePerformanceController);
router.get('/:id/academic-excellence', authorize('admin', 'department_principal', 'teacher'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getClassAcademicExcellenceSummary);
router.get('/:id/academic-excellence/objectives', authorize('admin', 'department_principal', 'teacher'), requireFeature('academicIntelligence'), validationRules.mongoId, validate, getClassAcademicExcellenceObjectives);

router.route('/:id')
    .get(authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getClass)
    .put(authorize('admin', 'department_principal'), validationRules.mongoId, validate, updateClass)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteClass);

router.post('/:id/subjects', authorize('admin'), validationRules.mongoId, validate, addSubjectToClass);
router.delete('/:id/subjects/:subjectId', authorize('admin'), removeSubjectFromClass);
router.get('/:id/stats', authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getClassStats);

export default router;
