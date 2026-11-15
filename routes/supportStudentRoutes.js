import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    getSurvey,
    listSurveys,
    noConcerns,
    saveSurvey,
    skip,
    submitSurvey,
} from '../controllers/supportStudentController.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('student'));

router.get('/surveys', listSurveys);
router.get('/surveys/:surveyId', getSurvey);
router.put('/surveys/:surveyId/answers', saveSurvey);
router.post('/surveys/:surveyId/submit', submitSurvey);
router.post('/surveys/:surveyId/no-concerns', noConcerns);
router.post('/surveys/:surveyId/skip', skip);

export default router;
