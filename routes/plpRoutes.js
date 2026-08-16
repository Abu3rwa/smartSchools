import express from 'express';
import { protect } from '../middleware/auth.js';
import { requireSchoolContext } from '../middleware/tenantIsolation.js';
import { authorize } from '../middleware/auth.js';
import {
    getMonthConfigs, getMonthConfig, createMonthConfig, updateMonthConfig,
    publishMonthConfig, closeMonthConfig,
    getRecords, getRecord, createRecord, updateRecord, submitRecord,
    getEvidence, createEvidence, deleteEvidence,
    getAwardCandidates, setAwardDecision,
    getRecommendations, regenerateRecommendations,
    getSupervisorTeachers,
    getSupervisorAssignments, createSupervisorAssignment, deleteSupervisorAssignment,
    getAuditLogs, getThemeLabels,
    getTraits, getTrait, createTrait, updateTrait, setTraitActive, seedTraits,
} from '../controllers/plpController.js';

const router = express.Router();
router.use(protect);
router.use(requireSchoolContext);

// ─── Theme labels ────────────────────────────────────────────────────────────────
router.get('/theme-labels', getThemeLabels);

// ─── Month Config ─────────────────────────────────────────────────────────────────
router.route('/config/month').get(getMonthConfigs).post(createMonthConfig);
router.route('/config/month/:id').get(getMonthConfig).put(updateMonthConfig);
router.post('/config/month/:id/publish', publishMonthConfig);
router.post('/config/month/:id/close', closeMonthConfig);

// ─── Records ──────────────────────────────────────────────────────────────────────
router.route('/records').get(getRecords).post(createRecord);
router.route('/records/:id').get(getRecord).put(updateRecord);
router.post('/records/:id/submit', submitRecord);

// ─── Evidence ─────────────────────────────────────────────────────────────────────
router.get('/records/:id/evidence', getEvidence);
router.post('/records/:id/evidence', createEvidence);
router.delete('/evidence/:id', deleteEvidence);

// ─── Awards ───────────────────────────────────────────────────────────────────────
router.get('/awards/candidates', getAwardCandidates);
router.post('/awards/decision', setAwardDecision);

// ─── Recommendations ──────────────────────────────────────────────────────────────
router.get('/records/:id/recommendations', getRecommendations);
router.post('/recommendations/regenerate/:id', regenerateRecommendations);

// ─── Supervisor scope ─────────────────────────────────────────────────────────────
router.get('/supervisor/teachers', getSupervisorTeachers);

// ─── Supervisor assignments (admin) ───────────────────────────────────────────────
router.route('/supervisor-assignments').get(getSupervisorAssignments).post(createSupervisorAssignment);
router.delete('/supervisor-assignments/:id', deleteSupervisorAssignment);

// ─── Audit ────────────────────────────────────────────────────────────────────────
router.get('/audit', getAuditLogs);

// ─── Trait Config ────────────────────────────────────────────────────────────────
router.get('/traits', getTraits);
router.get('/traits/:id', getTrait);
router.post('/traits', authorize('admin'), createTrait);
router.put('/traits/:id', authorize('admin'), updateTrait);
router.post('/traits/:id/activate', authorize('admin'), setTraitActive);
router.post('/traits/seed', authorize('admin'), seedTraits);

export default router;
