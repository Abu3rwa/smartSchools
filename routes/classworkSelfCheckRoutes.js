import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { classworkSelfCheckRateLimiter } from '../middleware/rateLimiters.js';
import {
  getCurrentCheck,
  myChecks,
  saveMyResponse,
  setCheck
} from '../controllers/classworkSelfCheckController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(classworkSelfCheckRateLimiter);

const staff = authorize('teacher', 'admin', 'super_admin');

router.get('/mine', authorize('student'), myChecks);
router.post('/:id/responses', authorize('student'), saveMyResponse);
router.get('/current', staff, getCurrentCheck);
router.put('/', staff, setCheck);

export default router;
