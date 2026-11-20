import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireBehaviorSystem } from '../middleware/requireBehaviorSystem.js';
import { aiFeatureRateLimiter, emailSendRateLimiter } from '../middleware/rateLimiters.js';
import { getBehaviorSettings } from '../services/behavior/settingsService.js';
import { TEACHER_BEHAVIOR_CATEGORIES } from '../constants/teacherBehavior.js';
import { reviewEntry } from '../services/behavior/teacherBehaviorService.js';
import { getEntryDetail, previewEntryMessage, sendEntryMessage, recordManualContact, linkFormalCase } from '../services/behavior/entryCommunicationService.js';
import { refineBehaviorDescription } from '../services/behavior/refinementService.js';
import {
    getBehaviorOverview,
    getBehaviorRoster,
    getBehaviorEntries,
    createBehaviorEntry,
    getStudentBehaviorSummary,
    completeBehaviorFollowUp
} from '../controllers/teacherBehaviorController.js';
import { protect, authorize } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import {
    validateTeacherBehavior,
    teacherBehaviorEntryBodySchema,
    teacherBehaviorEntriesQuerySchema,
    teacherBehaviorStudentParamSchema,
    teacherBehaviorEntryParamSchema,
    teacherBehaviorFollowUpBodySchema
} from '../validators/teacherBehaviorValidators.js';

const router = express.Router();

router.use(protect);
router.use(requireSchoolContext);
router.use(authorize('teacher', 'admin', 'department_principal', 'super_admin', 'behavior_manager'));
router.use(requireBehaviorSystem);

router.get('/overview', getBehaviorOverview);
router.get('/roster', getBehaviorRoster);

router.get(
    '/entries',
    validateTeacherBehavior({ querySchema: teacherBehaviorEntriesQuerySchema }),
    getBehaviorEntries
);
router.post(
    '/entries',
    validateTeacherBehavior({ bodySchema: teacherBehaviorEntryBodySchema }),
    createBehaviorEntry
);
router.post(
    '/entries/:id/follow-up',
    validateTeacherBehavior({
        paramsSchema: teacherBehaviorEntryParamSchema,
        bodySchema: teacherBehaviorFollowUpBodySchema
    }),
    completeBehaviorFollowUp
);

router.get(
    '/students/:studentId/summary',
    validateTeacherBehavior({ paramsSchema: teacherBehaviorStudentParamSchema }),
    getStudentBehaviorSummary
);

const respond = (action) => asyncHandler(async (req, res) => {
    const data = await action(req);
    res.json({ success: true, data });
});
const entryBody = (bodySchema) => validateTeacherBehavior({ paramsSchema: teacherBehaviorEntryParamSchema, bodySchema });

router.get('/catalog', respond(async (req) => ({
    categories: TEACHER_BEHAVIOR_CATEGORIES.map(({ key }) => ({ key })),
    severities: ['minor', 'moderate', 'serious'],
    approverRoles: (await getBehaviorSettings(req.schoolId)).approval?.approverRoles || [],
    routineCountsTowardConsequences: false
})));
router.get('/entries/:id', entryBody(null), respond((req) => getEntryDetail({ req, entryId: req.params.id })));
router.post('/entries/:id/review', entryBody(teacherBehaviorFollowUpBodySchema), respond((req) => reviewEntry({ req, entryId: req.params.id, note: req.body.note })));
router.post('/entries/:id/message-preview', entryBody(z.object({
    language: z.enum(['en', 'ar']), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(2000)
}).strict()), respond((req) => previewEntryMessage({ req, entryId: req.params.id, payload: req.body })));
router.post('/entries/:id/message-send', emailSendRateLimiter, entryBody(z.object({
    previewHash: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true), approve: z.boolean().optional()
}).strict()), respond((req) => sendEntryMessage({ req, entryId: req.params.id, ...req.body })));
router.post('/entries/:id/contact', entryBody(z.object({ method: z.enum(['phone', 'in_person']) }).strict()), respond((req) => recordManualContact({ req, entryId: req.params.id, method: req.body.method })));
router.post('/entries/:id/formal-case', entryBody(z.object({ incidentId: z.string().regex(/^[a-fA-F0-9]{24}$/) }).strict()), respond((req) => linkFormalCase({ req, entryId: req.params.id, incidentId: req.body.incidentId })));
router.post('/refine', aiFeatureRateLimiter, validateTeacherBehavior({ bodySchema: z.object({
    student: z.string().regex(/^[a-fA-F0-9]{24}$/).optional(), text: z.string().trim().min(1).max(1000), language: z.enum(['en', 'ar']), diagnostic: z.boolean().optional()
}).strict() }), respond((req) => refineBehaviorDescription({ req, payload: req.body })));

export default router;
