import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    checkIn,
    history,
    overview,
    saveSurvey,
    submitSurvey,
} from '../controllers/supportParentController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('parent'));

router.get('/', overview);
router.get('/students/:studentId/history', history);
router.post('/plans/:planId/checkins', checkIn);
router.put('/surveys/:surveyId/answers', saveSurvey);
router.post('/surveys/:surveyId/submit', submitSurvey);

export default router;
