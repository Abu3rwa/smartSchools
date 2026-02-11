import express from 'express';
import {
    getStandards,
    getStandard,
    createStandard,
    updateStandard,
    deleteStandard,
    importStandards,
    getStandardsBySubject
} from '../controllers/standardController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Standards CRUD
router.route('/')
    .get(getStandards)
    .post(authorize('admin'), createStandard);

// Bulk import
router.post('/import', authorize('admin'), importStandards);

// Grouped by subject
router.get('/by-subject', getStandardsBySubject);

// Single standard
router.route('/:id')
    .get(validationRules.mongoId, validate, getStandard)
    .put(authorize('admin'), validationRules.mongoId, validate, updateStandard)
    .delete(authorize('admin'), validationRules.mongoId, validate, deleteStandard);

export default router;
