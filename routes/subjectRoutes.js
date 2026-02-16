import express from 'express';
import {
    getSubjects,
    getSubject,
    createSubject,
    updateSubject,
    deleteSubject,
    getSubjectsByGrade,
    bulkCreateSubjects
} from '../controllers/subjectController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

// CRUD routes
router.route('/')
    .get(getSubjects)
    .post(authorize('admin'), validationRules.createSubject, validate, createSubject);

// Bulk create
router.post('/bulk', authorize('admin'), bulkCreateSubjects);

// Get by grade
router.get('/grade/:grade', getSubjectsByGrade);

router.route('/:id')
    .get(validationRules.mongoId, validate, getSubject)
    .put(authorize('admin'), validationRules.mongoId, validate, updateSubject)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteSubject);

export default router;
