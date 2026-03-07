import express from 'express';
import {
    getTeachers,
    getTeacher,
    createTeacher,
    importTeachers,
    updateTeacher,
    deleteTeacher,
    assignMultipleClasses,
    removeClassAssignment,
    getMyClasses
} from '../controllers/teacherController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

// Teacher's own classes
router.get('/my-classes', authorize('teacher'), getMyClasses);

// CRUD: admin sees all; department_principal sees only their department
router.route('/')
    .get(authorize('admin', 'department_principal', 'teacher'), getTeachers)
    .post(authorize('admin', 'department_principal'), validationRules.createTeacher, validate, createTeacher);

router.post('/import', authorize('admin', 'department_principal'), importTeachers);

router.route('/:id')
    .get(authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getTeacher)
    .put(authorize('admin', 'department_principal'), validationRules.mongoId, validate, updateTeacher)
    .delete(authorize('admin', 'department_principal'), validationRules.mongoId, validate, deleteTeacher);

router.post('/:id/assign-classes', authorize('admin', 'department_principal'), validationRules.mongoId, validate, assignMultipleClasses);
router.delete('/:id/remove-class/:assignmentId', authorize('admin', 'department_principal'), removeClassAssignment);

export default router;
