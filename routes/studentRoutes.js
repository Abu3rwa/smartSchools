import express from 'express';
import {
    getStudents,
    getStudent,
    createStudent,
    updateStudent,
    uploadStudentPhoto,
    removeStudentPhoto,
    deleteStudent,
    getStudentsByClass,
    bulkEnrollStudents,
    enrollStudent,
    importStudents,
    transferStudent,
    createStudentLogin,
    bulkCreateStudentLogin,
    resetStudentPassword,
    sendParentCredentials
} from '../controllers/studentController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

router.route('/')
    .get(authorize('admin', 'department_principal', 'teacher'), getStudents)
    .post(authorize('admin'), validationRules.createStudent, validate, createStudent);

// Additional routes (before /:id to avoid param conflicts)
router.post('/import', authorize('admin'), importStudents);
router.post('/bulk-create-login', authorize('admin'), bulkCreateStudentLogin);
router.get('/class/:classId', authorize('admin', 'department_principal', 'teacher'), getStudentsByClass);
router.put('/:id/photo', authorize('admin'), validationRules.mongoId, validate, upload.single('photo'), uploadStudentPhoto);
router.delete('/:id/photo', authorize('admin'), validationRules.mongoId, validate, removeStudentPhoto);

router.route('/:id')
    .get(authorize('admin', 'department_principal', 'teacher'), validationRules.mongoId, validate, getStudent)
    .put(authorize('admin'), validationRules.mongoId, validate, updateStudent)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteStudent);
router.post('/bulk-enroll', authorize('admin'), bulkEnrollStudents);
router.post('/:id/create-login', authorize('admin'), createStudentLogin);
router.post('/:id/reset-password', authorize('admin'), resetStudentPassword);
router.post('/:id/send-parent-credentials', authorize('admin'), sendParentCredentials);
router.put('/:id/transfer', authorize('admin'), validationRules.mongoId, validate, transferStudent);
router.put('/:id/enroll', authorize('admin'), validationRules.mongoId, validate, enrollStudent);

export default router;
