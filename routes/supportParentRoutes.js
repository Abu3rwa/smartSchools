import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    checkIn,
    familyPlan,
    history,
    noConcerns,
    overview,
    requestSupport,
    saveSurvey,
    skip,
    submitSurvey,
} from '../controllers/supportParentController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('parent'));

router.get('/', overview);
router.post('/requests', requestSupport);
router.get('/students/:studentId/plan', familyPlan);
router.get('/students/:studentId/history', history);
router.post('/plans/:planId/checkins', checkIn);
router.put('/surveys/:surveyId/answers', saveSurvey);
router.post('/surveys/:surveyId/submit', submitSurvey);
router.post('/surveys/:surveyId/no-concerns', noConcerns);
router.post('/surveys/:surveyId/skip', skip);

export default router;
