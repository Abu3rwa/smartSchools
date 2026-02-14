import express from 'express';
import {
    getRequestTypes,
    getAllRequestTypes,
    getRequestType,
    createRequestType,
    updateRequestType,
    deactivateRequestType
} from '../controllers/attendanceRequestTypeController.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate, validationRules } from '../middleware/validator.js';

const router = express.Router();
router.use(protect);

// Form dropdown: active types only (any authenticated user)
router.get('/', getRequestTypes);

// Admin: all types including inactive
router.get('/all', authorize('admin'), getAllRequestTypes);

// Admin CRUD
router.post('/', authorize('admin'), validationRules.createAttendanceRequestType, validate, createRequestType);
router.get('/:id', authorize('admin'), validationRules.mongoId, validate, getRequestType);
router.put('/:id', authorize('admin'), validationRules.mongoId, validate, updateRequestType);
router.patch('/:id/deactivate', authorize('admin'), validationRules.mongoId, validate, deactivateRequestType);

export default router;
