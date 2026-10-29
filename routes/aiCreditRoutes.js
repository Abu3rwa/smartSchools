import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    allocateCredit,
    cancelCreditRequest,
    decideCreditRequest,
    getMyCredit,
    getMyCreditHistory,
    getTeacherCreditHistory,
    listCreditAccounts,
    reclaimCredit,
    requestCredit,
    updateCreditSettings
} from '../controllers/aiCreditController.js';

/**
 * Prepaid AI credit for one school. Deliberately outside any feature module:
 * the balance pays for every AI feature, not just the one that introduced it.
 */
const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);

const staff = authorize('teacher', 'admin', 'super_admin');
const admin = authorize('admin', 'super_admin');

/* The signed-in person: balance, history, and asking for more */
router.get('/', staff, getMyCredit);
router.get('/history', staff, getMyCreditHistory);
router.post('/requests', staff, requestCredit);
router.post('/requests/:requestId/cancel', staff, cancelCreditRequest);

/* School admin: read usage, move reserve credit, answer requests */
router.get('/accounts', admin, listCreditAccounts);
router.get('/accounts/:userId/history', admin, getTeacherCreditHistory);
router.post('/accounts/:userId/allocate', admin, allocateCredit);
router.post('/accounts/:userId/reclaim', admin, reclaimCredit);
router.patch('/accounts/:userId', admin, updateCreditSettings);
router.post('/requests/:requestId/decide', admin, decideCreditRequest);

export default router;
