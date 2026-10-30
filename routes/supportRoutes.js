import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { emailSendRateLimiter } from '../middleware/rateLimiters.js';
import {
    addExternal,
    approve,
    checkIn,
    createCycles,
    generateDraft,
    getClassCycles,
    getClasses,
    getCycle,
    history,
    publish,
    rotateCode,
    sendInvites,
} from '../controllers/supportController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin'));

router.get('/classes', getClasses);
router.get('/cycles', getClassCycles);
router.post('/cycles', createCycles);
router.get('/cycles/:cycleId', getCycle);

router.post('/cycles/:cycleId/external-teacher', addExternal);
router.post('/cycles/:cycleId/respondents/:respondentId/code', rotateCode);
router.post('/cycles/:cycleId/invite', emailSendRateLimiter, sendInvites);

router.post('/cycles/:cycleId/plan/draft', generateDraft);
router.post('/cycles/:cycleId/plan/approve', approve);
router.post('/cycles/:cycleId/plan/publish', publish);
router.post('/cycles/:cycleId/checkins', checkIn);

router.get('/students/:studentId/history', history);

export default router;
