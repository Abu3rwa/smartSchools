import express from 'express';
import {
    createAttendanceRequest,
    listAttendanceRequests,
    getAttendanceRequest,
    downloadAttendanceRequestAttachment,
    reviewAttendanceRequest,
    cancelAttendanceRequest,
    getEligibleStudents,
    getRequesterContext,
} from '../controllers/attendanceRequestController.js';
import { protect, authorize, resolveDepartmentScope } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { parseQueryFilter } from '../middleware/queryFilter.js';
import { validate, validationRules } from '../middleware/validator.js';
import { uploadAttendanceRequestFile } from '../middleware/uploadAttendanceRequest.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);
router.use(resolveDepartmentScope);
router.use(parseQueryFilter);

router.get('/requester-context', getRequesterContext);
router.get('/eligible-students', authorize('parent', 'student'), getEligibleStudents);

router
    .route('/')
    .get(listAttendanceRequests)
    .post(
        authorize('admin', 'department_principal', 'teacher', 'parent', 'student'),
        (req, res, next) => {
            uploadAttendanceRequestFile(req, res, (err) => {
                if (err) {
                    return res.status(400).json({ success: false, message: err.message || 'File upload error' });
                }
                next();
            });
        },
        createAttendanceRequest
    );

router.get('/:id', validationRules.mongoId, validate, getAttendanceRequest);
router.get('/:id/attachment', validationRules.mongoId, validate, downloadAttendanceRequestAttachment);
router.patch(
    '/:id/cancel',
    authorize('parent', 'student'),
    validationRules.mongoId,
    validate,
    cancelAttendanceRequest
);
router.patch(
    '/:id/review',
    authorize('admin', 'department_principal'),
    [...validationRules.mongoId, ...validationRules.reviewAttendanceRequest],
    validate,
    reviewAttendanceRequest
);

export default router;
