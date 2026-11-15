import express from 'express';
import {
    supportAccessLimiter,
    supportCodeLimiter,
} from '../middleware/rateLimiters.js';
import {
    checkIn,
    getSurvey,
    hub,
    noConcerns,
    requireSupportAccess,
    resolveCode,
    saveSurvey,
    skip,
    submitSurvey,
} from '../controllers/supportAccessController.js';

const router = express.Router();

router.post('/resolve', supportCodeLimiter, resolveCode);

router.use(supportAccessLimiter);
router.use(requireSupportAccess);

router.get('/hub', hub);
router.get('/surveys/:surveyId', getSurvey);
router.put('/surveys/:surveyId/answers', saveSurvey);
router.post('/surveys/:surveyId/submit', submitSurvey);
router.post('/surveys/:surveyId/no-concerns', noConcerns);
router.post('/surveys/:surveyId/skip', skip);
router.post('/plans/:planId/checkins', checkIn);

export default router;
